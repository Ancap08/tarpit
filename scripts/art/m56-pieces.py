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


def rendered_frames(scratch, kind, sheet, old, density, border):
    from PIL import Image, ImageDraw
    from m56_finish import flight_shadow, keep_light, lifted

    def fit(value):
        return round(value * density / 2)

    crowd = kind in poses.ENEMIES or kind == 'guard'
    contacts = {'goblin': 18, 'wolf': 27, 'shieldbearer': 28, 'troll': 44,
                'grumblefoot': 50, 'grumblemaw': 52, 'guard': 21}
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
        frame = Image.new('RGBA', tuple(fit(n) + 2 * border for n in sheet['frameSize']))
        ax, ay = (fit(n) + border for n in sheet['anchor'])
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
        body_at = (left + border, top + border)
        if kind == 'harpy-shadow':
            frame.alpha_composite(body, body_at)
            yield flight_shadow(frame, density), None
            continue
        old_contact = None
        if kind in poses.CONTACT_WIDTH:
            old_contact, frame = frame, Image.new('RGBA', frame.size)
        frame.alpha_composite(body, body_at)
        contact = ((19, 4, 108) if kind in poses.TOWERS else
                   (contacts[kind] / 2, 3, 122) if kind in contacts else None)
        moon = lifted(keep_light(frame, True), density, (ax, ay), contact=contact,
                      old_contact=old_contact, crowd=crowd) if density > 2 else None
        if density > 2:
            frame = keep_light(frame, False)
        yield lifted(frame, density, (ax, ay), contact=contact, old_contact=old_contact, crowd=crowd), moon


def write_pack(name, entries, layout, quality=88, trim_border=0):
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
        layout[kind]['regions'][i] = [x, y, image.width, image.height, *(n - trim_border for n in offset)]
        coordinates.append((image, x, y))
        right = max(right, x + image.width + 1)
        x += image.width + 2
        row = max(row, image.height + 2)
    atlas = Image.new('RGBA', (right, y + row - 1))
    for image, x, y in coordinates:
        atlas.paste(image, (x, y))
    atlas.save(OUT / f'{name}.webp', quality=quality, method=6, lossless=name == 'scenery')
    print(f'{name}: {atlas.width} × {atlas.height}, {len(tiles)} frames, {atlas.width * atlas.height * 4:,} RGBA bytes')


def pack_machines(catalogue):
    from PIL import Image
    from m56_finish import lifted

    # Finish the established machine silhouettes without clipping their
    # feather to the cell. Their trim offsets preserve the display geometry.
    machines = runpy.run_path(str(HERE / 'siege_machines.py'))
    for name, draw in (('ram-keep', lambda p, i: machines['ram'](p, i, lifted=True)),
                       ('notice-keep', lambda p, _: machines['parchment'](p, 14, False, lifted=True))):
        ram = name == 'ram-keep'
        width, height = size = (360, 240) if ram else (120, 80)
        density = width / (88 if ram else 34)
        border = math.ceil(density * 5)
        anchor = (width // 2, round(height * .84) if ram else height // 2)
        padded_anchor = tuple(n + border for n in anchor)
        frames = []
        for i in range(4 if ram else 1):
            drawing = machines['Drawing']()
            draw(drawing, i)
            source = Image.new('RGBA', (width + 2 * border, height + 2 * border))
            source.paste(drawing.image.resize(size, Image.Resampling.LANCZOS), (border, border))
            frames.append(lifted(source, density, padded_anchor,
                                 contact=(36, 5, 122) if ram else None, crowd=ram))
        write_pack(name, [(name, {'density': 3, 'frameSize': size, 'anchor': anchor}, frames)],
                   catalogue, trim_border=border)


def geometry(sheet, density, border=0):
    meta = {'density': density, 'frameSize': [round(v * density / 2) + 2 * border for v in sheet['frameSize']],
            'anchor': [round(v * density / 2) + border for v in sheet['anchor']]}
    if 'bodyBounds' in sheet:
        meta['bodyBounds'] = [[round(v * density / 2) + border for v in box] for box in sheet['bodyBounds']]
    return meta


def pack_piece(scratch, catalogue, kind, sheet, old, density):
    border = math.ceil(density * 5)
    pairs = list(rendered_frames(scratch, kind, sheet, old, density, border))
    frames, moon = map(list, zip(*pairs))
    meta = geometry(sheet, density, border)
    name = f'{kind}-{density:g}x'
    write_pack(name, [(name, meta, frames)], catalogue)
    if moon[0] is not None:
        variant = {}
        write_pack(name + '-moon', [(name, meta, moon)], variant)
        if variant[name]['regions'] != catalogue[name]['regions']:
            raise ValueError(f'{name}: Keep lighting changed the frame geometry')
        catalogue[name]['moonAtlas'] = variant[name]['atlas']
    return meta, frames


def pack(scratch):
    from PIL import Image

    OUT.mkdir(parents=True, exist_ok=True)
    packed = ART / 'packed/shared-2x'
    original = json.loads(packed.with_suffix('.json').read_text())
    atlas = Image.open(packed.with_suffix('.webp')).convert('RGBA')
    catalogue = {}
    previews = []

    for kind in PIECES:
        sheet = original[kind]
        old = list(shipped_frames(atlas, sheet))
        if kind == 'guard':
            tiers = (4,)
        elif kind == 'grumblemaw':
            # His much larger cell, doubled for the hit frames, sets the
            # finale's memory ceiling. Keep full density on the rest of the cast.
            tiers = (2, 3.25)
        elif kind in poses.ENEMIES and kind != 'harpy':
            tiers = (2, 4)
        elif kind == 'harpy-shadow':
            tiers = (2,)
        else:
            tiers = (2, 3)
        for density in tiers:
            meta, frames = pack_piece(scratch, catalogue, kind, sheet, old, density)
            if density == 2 and kind in poses.TOWERS:
                previews.append((f'{kind}-icon', dict(meta, bodyBounds=[meta['bodyBounds'][PREVIEW]]),
                                 [frames[PREVIEW]]))
    write_pack('tower-icons', previews, catalogue)
    scenery = [(kind, geometry(original[kind], 2), list(shipped_frames(atlas, original[kind]))) for kind in SCENERY]
    write_pack('scenery', scenery, catalogue)
    pack_machines(catalogue)
    for suffix in ('', '-half'):
        source = OUT.parents[2] / f'public/assets/keep/siege-machines{suffix}.webp'
        with Image.open(source) as image:
            w, h = image.width // 4, image.height // 2
            image.crop((w, h, w * 4, h * 2)).save(
                OUT / f'gate-effects{suffix}.webp', lossless=True, method=6)
    (OUT / 'layout.json').write_text(json.dumps(catalogue, sort_keys=True, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    if 'bpy' in sys.modules:
        scratch, *kinds = sys.argv[sys.argv.index('--') + 1:]
        render_all(Path(scratch).resolve(), kinds or PIECES)
    else:
        pack(Path(sys.argv[1]))
