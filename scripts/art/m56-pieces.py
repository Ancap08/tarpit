"""Render and pack the optional M56 pieces using the shipped pose library.

    Blender -b -P scripts/art/m56-pieces.py -- /path/to/scratch
    python3 scripts/art/m56-pieces.py /path/to/scratch

The Blender pass writes supersampled PNGs to scratch. The Pillow pass packs
the shipped logical cells as trimmed, independently loadable WebP sheets.
"""
import json
import math
from pathlib import Path
import runpy
import sys

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
import slice_sheets as poses

ART = HERE.parents[1] / 'assets/art-painted'
OUT = ART / 'sharp'
PIECES = poses.ACTORS + poses.PROJECTILES + ('harpy-shadow',)
SCENERY = (*poses.SCENERY, 'town', 'sack', 'royal-hoist', 'tossed-hat')
PREVIEW = 6


def render_all(scratch, kinds):
    import bpy
    import render

    def style(scene):
        # The broad key and untextured finish from the M54 comparison.
        key = bpy.data.objects['Daylight key']
        key.location = (-4, 2, 7)
        key.rotation_euler = (-key.location).to_track_quat('-Z', 'Y').to_euler()
        key.data.size = 4.5
        key.data.energy = 1250

        def material(name, swatch):
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            shader = mat.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Base Color'].default_value = (
                *(render.linear(int(swatch[i:i + 2], 16)) for i in (1, 3, 5)), 1)
            shader.inputs['Roughness'].default_value = .47
            return mat
        return material

    for kind in kinds:
        poses.render_cells(kind, scratch, style, actor_resolution=384, prop_resolution=256)


def shipped_frames(atlas, sheet):
    x, y = sheet['offset']
    width, height = sheet['frameSize']
    columns = sheet['columns']
    for i in range(len(sheet['frameOrder'])):
        left, top = x + i % columns * width, y + i // columns * height
        yield atlas.crop((left, top, left + width, top + height))


def rendered_frames(scratch, kind, sheet, old, density):
    from PIL import Image, ImageDraw

    def fit(value):
        return round(value * density / 2)

    for i, (label, original) in enumerate(zip(sheet['frameOrder'], old)):
        with Image.open(scratch / kind / f'{label}.png') as source:
            alpha = source.getchannel('A')
            raw = alpha.point(lambda a: 255 if a >= 128 else 0).getbbox() or alpha.getbbox()
            # Preserve the on-board footprint and ground pivot of every pose.
            bounds = sheet.get('bodyBounds', [])[i] if kind in poses.ACTORS else original.getbbox()
            left, top, right, bottom = map(fit, bounds)
            if kind not in poses.ACTORS:
                raw = alpha.getbbox()
            body = source.crop(raw).resize((right - left, bottom - top), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', tuple(map(fit, sheet['frameSize'])))
        ax, ay = map(fit, sheet['anchor'])
        if kind in poses.TOWERS:
            # Keep the same base, drawn at the target density with smooth edges.
            base = Image.new('RGBA', (frame.width * 2, frame.height * 2))
            draw = ImageDraw.Draw(base)
            for inset, lower, color in ((0, 0, '#403930'), (1, 1.5, '#b7a486'), (2, 2.5, '#736754')):
                area = (ax - (33 - inset) * density, ay - (9.5 - inset) * density,
                        ax + (33 - inset) * density, ay + (9.5 - lower) * density)
                # The original 2x contact width is 66 source pixels.
                area = (ax + (area[0] - ax) / 2, ay + (area[1] - ay) / 2,
                        ax + (area[2] - ax) / 2, ay + (area[3] - ay) / 2)
                draw.ellipse(tuple(round(n * 2) for n in area), fill=color)
            frame = base.resize(frame.size, Image.Resampling.LANCZOS)
        elif kind in poses.CONTACT_WIDTH:
            w = round(poses.CONTACT_WIDTH[kind] * density)
            h = round(w * .29)
            shadow = Image.new('RGBA', (w, h), poses.INK)
            alpha = Image.new('L', (w, h))
            alpha.putdata([round(56 * max(0, 1 - ((2*x+1)/w-1)**2 - ((2*y+1)/h-1)**2)**2)
                           for y in range(h) for x in range(w)])
            shadow.putalpha(alpha)
            frame.paste(shadow, (ax - w//2, ay - h//2))
        frame.alpha_composite(body, (left, top))
        yield frame


def write_pack(name, entries, layout, quality=88):
    from PIL import Image

    # Pack wide-first into shelves. A one-pixel clear gutter keeps adjacent
    # poses from bleeding into linear samples of a trimmed frame.
    tiles = []
    for kind, meta, frames in entries:
        layout[kind] = dict(meta, atlas=name, regions=[None] * len(frames))
        for i, frame in enumerate(frames):
            box = frame.getbbox()
            if not box:
                raise ValueError(f'Empty frame: {name} {kind} {i}')
            tiles.append((kind, i, box[:2], frame.crop(box)))
    area = sum((image.width + 2) * (image.height + 2) for *_, image in tiles)
    width = max(max(image.width + 2 for *_, image in tiles), math.ceil(math.sqrt(area * 1.3)))
    coordinates = []
    x, y, row, right = 1, 1, 0, 0
    for kind, i, offset, image in sorted(tiles, key=lambda tile: -tile[-1].height):
        if x + image.width + 1 > width:
            x, y, row = 1, y + row, 0
        layout[kind]['regions'][i] = [x, y, image.width, image.height, *offset]
        coordinates.append((image, x, y))
        right = max(right, x + image.width + 1)
        x += image.width + 2
        row = max(row, image.height + 2)
    atlas = Image.new('RGBA', (right, y + row - 1))
    for image, x, y in coordinates:
        atlas.paste(image, (x, y))
    atlas.save(OUT / f'{name}.webp', quality=quality, method=6, lossless=name == 'scenery')
    print(f'{name}: {atlas.width} × {atlas.height}, {len(tiles)} frames, {atlas.width * atlas.height * 4:,} RGBA bytes')


def pack(scratch):
    from PIL import Image

    OUT.mkdir(parents=True, exist_ok=True)
    packed = ART / 'packed/shared-2x'
    original = json.loads(packed.with_suffix('.json').read_text())
    atlas = Image.open(packed.with_suffix('.webp')).convert('RGBA')
    catalogue = {}
    previews = []

    def geometry(sheet, density):
        meta = {'density': density, 'frameSize': [v * density // 2 for v in sheet['frameSize']],
                'anchor': [v * density // 2 for v in sheet['anchor']]}
        if 'bodyBounds' in sheet:
            meta['bodyBounds'] = [[round(v * density / 2) for v in box] for box in sheet['bodyBounds']]
        return meta

    for kind in PIECES:
        sheet = original[kind]
        old = list(shipped_frames(atlas, sheet))
        if kind == 'guard':
            tiers = (4,)
        elif kind in poses.ENEMIES and kind != 'harpy':
            tiers = (2, 4)
        elif kind == 'harpy-shadow':
            tiers = (2,)
        else:
            tiers = (2, 3)
        for density in tiers:
            frames = list(rendered_frames(scratch, kind, sheet, old, density))
            meta = geometry(sheet, density)
            name = f'{kind}-{density}x'
            write_pack(name, [(name, meta, frames)], catalogue)
            if density == 2 and kind in poses.TOWERS:
                previews.append((f'{kind}-icon', dict(meta, bodyBounds=[meta['bodyBounds'][PREVIEW]]),
                                 [frames[PREVIEW]]))
    write_pack('tower-icons', previews, catalogue)
    scenery = [(kind, geometry(original[kind], 2), list(shipped_frames(atlas, original[kind]))) for kind in SCENERY]
    write_pack('scenery', scenery, catalogue)
    # The original ram and notice are painted by code. Reuse those exact
    # paths at a higher output density and retain their established origins.
    machines = runpy.run_path(str(HERE / 'siege_machines.py'))
    for name, draw in (('ram-keep', lambda p, i: machines['ram'](p, i)),
                       ('notice-keep', lambda p, _: machines['parchment'](p, 14, False))):
        size = (360, 240) if name == 'ram-keep' else (120, 80)
        frames = []
        for i in range(4 if name == 'ram-keep' else 1):
            drawing = machines['Drawing']()
            draw(drawing, i)
            frames.append(drawing.image.resize(size, Image.Resampling.LANCZOS))
        write_pack(name, [(name, {'density': 3, 'frameSize': size, 'anchor': [n // 2 for n in size]}, frames)], catalogue)
    for suffix in ('', '-half'):
        source = OUT.parents[2] / f'public/assets/keep/siege-machines{suffix}.webp'
        with Image.open(source) as image:
            w, h = image.width // 4, image.height // 2
            image.crop((w, h, w * 4, h * 2)).save(
                OUT / f'gate-effects{suffix}.webp', lossless=True, method=6)
    (OUT / 'layout.json').write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    if 'bpy' in sys.modules:
        scratch, *kinds = sys.argv[sys.argv.index('--') + 1:]
        render_all(Path(scratch).resolve(), kinds or PIECES)
    else:
        pack(Path(sys.argv[1]))
