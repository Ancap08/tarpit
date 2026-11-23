# Asset manifest

Every file under `assets/`, `docs/art/` and `public/icons/` is listed here
with its source, author and license. Only CC0, or CC-BY with a credit line
in Notes (`Credit: ...`), may be committed (docs/SCOPE-v3.md, "Hard
rules"). The one exception is the project's own work drawn by a script in
this repo (Source `scripts/...`): it carries the repo's MIT license.
`npm run check:assets` (scripts/check-asset-manifest.ts) fails CI if a file
is missing from the table, carries another license, or a row points at no
file. Markdown files (this manifest, `docs/art/INVENTORY.md`) are project
docs under the repo's MIT license and are not listed.

Paths are repo-relative and matched exactly. Keep the table's header as is:
the checker looks for it.

| Path | Source | Author | License | Notes |
|---|---|---|---|---|
| `docs/art/mockups/A-ninja-adventure.png` | Composite: a Tarpit screenshot plus crops from https://pixel-boy.itch.io/ninja-adventure-asset-pack | Tarpit agents; sprites by Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Mockup derived from CC0 sources, see docs/art/INVENTORY.md |
| `docs/art/mockups/A-ninja-adventure-2x.png` | Composite: a Tarpit screenshot plus crops from https://pixel-boy.itch.io/ninja-adventure-asset-pack | Tarpit agents; sprites by Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Mockup derived from CC0 sources, see docs/art/INVENTORY.md |
| `docs/art/mockups/closeups.png` | Composite: a Tarpit screenshot plus crops from https://pixel-boy.itch.io/ninja-adventure-asset-pack and https://0x72.itch.io/dungeontileset-ii | Tarpit agents; sprites by Pixel-boy and AAA (Ninja Adventure) and 0x72 | CC0 1.0 | Mockup derived from CC0 sources, see docs/art/INVENTORY.md |
| `docs/art/mockups/B-0x72.png` | Composite: a Tarpit screenshot plus crops from https://0x72.itch.io/dungeontileset-ii | Tarpit agents; sprites by 0x72 | CC0 1.0 | Mockup derived from CC0 sources, see docs/art/INVENTORY.md |
| `docs/art/mockups/C-shapes-animated.png` | A Tarpit screenshot with Pillow-drawn insets | Tarpit agents | CC0 1.0 | Mockup; no pack sprites. See docs/art/INVENTORY.md |
| `assets/sprites/goblin.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack (`Actor/Character/GreenPig/SpriteSheet.png`, unchanged) | Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Placeholder until v5; layout in src/game/anim/sheets.ts |
| `assets/sprites/troll.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack (`Actor/Monster/Cyclope/SpriteSheet.png`, unchanged) | Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Placeholder until v5; layout in src/game/anim/sheets.ts |
| `assets/sprites/wolf.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack (`Actor/Animal/Hyena/SpriteSheet.png`, unchanged) | Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Placeholder until v5; layout in src/game/anim/sheets.ts |
| `assets/sprites/harpy.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack (`Actor/Monster/BlueBat/SpriteSheet.png`, unchanged) | Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Placeholder until v5; layout in src/game/anim/sheets.ts |
| `assets/sprites/shieldbearer.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack (`Actor/Character/Knight/SpriteSheet.png`, unchanged) | Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Placeholder until v5; layout in src/game/anim/sheets.ts |
| `assets/sprites/boss.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack (`Actor/Boss/DemonCyclop/Walk.png`, unchanged) | Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Placeholder until v5 (Grumblefoot, milestone 23); layout in src/game/anim/sheets.ts |
| `assets/sprites/boss-hit.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack (`Actor/Boss/DemonCyclop/Hit.png`, unchanged) | Pixel-boy and AAA (Ninja Adventure) | CC0 1.0 | Placeholder until v5 (Grumblefoot's hit flash, milestone 23); layout in src/game/anim/sheets.ts |
| `public/icons/icon-192.png` | `scripts/make-icons.ts` (drawn in code, no source art) | Tarpit agents | MIT | Home-screen icon 192 px, milestone 32a |
| `public/icons/icon-512.png` | `scripts/make-icons.ts` (drawn in code, no source art) | Tarpit agents | MIT | Home-screen icon 512 px, milestone 32a |
| `public/icons/icon-maskable-512.png` | `scripts/make-icons.ts` (drawn in code, no source art) | Tarpit agents | MIT | Home-screen icon 512 px, maskable (drawing in the central 80%), milestone 32a |
| `public/icons/apple-touch-icon.png` | `scripts/make-icons.ts` (drawn in code, no source art) | Tarpit agents | MIT | Home-screen icon 180 px for iOS, milestone 32a |
| `assets/art-painted/arrow-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/arrow-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/arrow-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/arrow-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/berry-bush-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/berry-bush-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/berry-bush-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/berry-bush-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/birch-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/birch-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/birch-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/birch-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/bush-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/bush-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/bush-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/bush-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cannon-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cannon-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cannon-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cannon-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cannonball-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cannonball-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cannonball-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cannonball-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cave-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cave-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cave-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cave-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cottage-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cottage-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/cottage-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/cottage-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/fire-pot-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/fire-pot-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/fire-pot-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/fire-pot-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/flame-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/flame-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/flame-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/flame-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/goblin-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/goblin-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/goblin-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/goblin-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/grumblefoot-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/grumblefoot-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/grumblefoot-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/grumblefoot-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/grumblemaw-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/grumblemaw-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/grumblemaw-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/grumblemaw-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/guard-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/guard-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/guard-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/guard-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/harpy-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/harpy-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/harpy-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/harpy-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/harpy-shadow-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/harpy-shadow-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/harpy-shadow-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/harpy-shadow-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/longbow-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/longbow-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/longbow-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/longbow-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/meadow-1x.json` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/meadow-1x.png` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Generated Meadow ground |
| `assets/art-painted/meadow-2x.json` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/meadow-2x.png` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Generated Meadow ground |
| `assets/art-painted/mortar-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/mortar-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/mortar-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/mortar-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/mortar-shell-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/mortar-shell-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/mortar-shell-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/mortar-shell-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/musketeer-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/musketeer-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/musketeer-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/musketeer-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/oak-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/oak-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/oak-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/oak-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/shieldbearer-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/shieldbearer-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/shieldbearer-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/shieldbearer-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/spruce-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/spruce-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/spruce-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/spruce-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/tar-glob-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/tar-glob-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/tar-glob-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/tar-glob-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/tar-pit-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/tar-pit-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/tar-pit-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/tar-pit-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/troll-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/troll-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/troll-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/troll-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/wolf-1x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/wolf-1x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/wolf-2x.json` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Frame layout |
| `assets/art-painted/wolf-2x.png` | `scripts/art/slice_sheets.py` | Tarpit agents | MIT | Generated painted sprite atlas |
| `assets/art-painted/packed/meadow-1x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/packed/meadow-2x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/packed/riverbend-1x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/packed/riverbend-2x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/packed/shared-1x.json` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Packed frame layout |
| `assets/art-painted/packed/shared-1x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Packed painted sprites and effects |
| `assets/art-painted/packed/shared-2x.json` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Packed frame layout |
| `assets/art-painted/packed/shared-2x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Packed painted sprites and effects |
| `assets/art-painted/packed/switchback-1x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/packed/switchback-2x.webp` | `scripts/art/pack_painted.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/switchback-1x.json` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted ground frame layout |
| `assets/art-painted/switchback-1x.png` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/switchback-2x.json` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted ground frame layout |
| `assets/art-painted/switchback-2x.png` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/riverbend-1x.json` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted ground frame layout |
| `assets/art-painted/riverbend-1x.png` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted map ground |
| `assets/art-painted/riverbend-2x.json` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted ground frame layout |
| `assets/art-painted/riverbend-2x.png` | `scripts/art/build_slice.py` | Tarpit agents | MIT | Painted map ground |
| `docs/art/painted-maps/meadow-landscape-empty.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/meadow-landscape-midwave.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/meadow-phone-empty.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/meadow-phone-midwave.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/riverbend-landscape-empty.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/riverbend-landscape-midwave.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/riverbend-phone-empty.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/riverbend-phone-midwave.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/switchback-landscape-empty.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/switchback-landscape-midwave.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/switchback-phone-empty.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/switchback-phone-midwave.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/slice-meadow/meadow-comparison-phone.png` | `scripts/art/slice_mocks.py` | Tarpit agents | MIT | Painted Meadow review with tracked game capture. Original Goblin sprite by Pixel-boy and AAA (Ninja Adventure), CC0 1.0. |
| `docs/art/slice-meadow/meadow-comparison.png` | `scripts/art/slice_mocks.py` | Tarpit agents | MIT | Painted Meadow review with tracked game capture. Original Goblin sprite by Pixel-boy and AAA (Ninja Adventure), CC0 1.0. |
| `docs/art/slice-meadow/meadow-contact.png` | `scripts/art/slice_mocks.py` | Tarpit agents | MIT | Painted Meadow review |
| `docs/art/spike-v5/comparison.png` | `scripts/art/build_spike.py` | Tarpit agents | MIT | Generated Blender art study with tracked game capture. Original game sprites by Pixel-boy and AAA (Ninja Adventure), CC0 1.0. |
