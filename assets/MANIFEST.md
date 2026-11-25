# Asset manifest

Every file under `assets/`, `docs/art/` and `public/icons/` is listed here
with its source, author and license. Third-party art uses CC0 or CC-BY
with a credit line in Notes (`Credit: ...`) as specified in docs/SCOPE-v3.md.
Repo-generated work carries MIT. Libre Caslon Text carries SIL OFL
1.1. Its rows pin each downloaded file by SHA-256 and name the bundled license.
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
| `docs/art/painted-maps/switchback-landscape-valid.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/switchback-landscape-invalid.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/switchback-phone-empty.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/switchback-phone-midwave.jpg` | `scripts/art/review_painted.ts` | Tarpit agents | MIT | Painted game capture |
| `docs/art/painted-maps/verifier/meadow-landscape-guards-wave8.jpg` | `scripts/art/verifier_painted_maps.ts` | Tarpit agents | MIT | Verifier capture of the painted game (milestone 43) |
| `docs/art/painted-maps/verifier/riverbend-landscape-fire-arrows-wave8.jpg` | `scripts/art/verifier_painted_maps.ts` | Tarpit agents | MIT | Verifier capture of the painted game (milestone 43) |
| `docs/art/painted-maps/verifier/riverbend-phone-barricade-wave8.jpg` | `scripts/art/verifier_painted_maps.ts` | Tarpit agents | MIT | Verifier capture of the painted game (milestone 43) |
| `docs/art/painted-maps/verifier/riverbend-phone-magnifier-trail-and-grass.jpg` | `scripts/art/verifier_painted_maps.ts` | Tarpit agents | MIT | Verifier capture of the painted game (milestone 43) |
| `docs/art/painted-maps/verifier/switchback-landscape-tar-barrel-wave8.jpg` | `scripts/art/verifier_painted_maps.ts` | Tarpit agents | MIT | Verifier capture of the painted game (milestone 43) |
| `docs/art/painted-maps/verifier/switchback-phone-fire-arrows-wave8.jpg` | `scripts/art/verifier_painted_maps.ts` | Tarpit agents | MIT | Verifier capture of the painted game (milestone 43) |
| `docs/art/slice-meadow/meadow-comparison-phone.png` | `scripts/art/slice_mocks.py` | Tarpit agents | MIT | Painted Meadow review with tracked game capture. Original Goblin sprite by Pixel-boy and AAA (Ninja Adventure), CC0 1.0. |
| `docs/art/slice-meadow/meadow-comparison.png` | `scripts/art/slice_mocks.py` | Tarpit agents | MIT | Painted Meadow review with tracked game capture. Original Goblin sprite by Pixel-boy and AAA (Ninja Adventure), CC0 1.0. |
| `docs/art/slice-meadow/meadow-contact.png` | `scripts/art/slice_mocks.py` | Tarpit agents | MIT | Painted Meadow review |
| `docs/art/spike-v5/comparison.png` | `scripts/art/build_spike.py` | Tarpit agents | MIT | Generated Blender art study with tracked game capture. Original game sprites by Pixel-boy and AAA (Ninja Adventure), CC0 1.0. |
| `docs/art/theme/assessor.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/characters.jpg` | `scripts/art/theme_sheet.py` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/king.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/meadow-landscape.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/meadow-phone.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/riverbend-landscape.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/riverbend-phone.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/switchback-landscape.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/switchback-phone.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b painted character review |
| `docs/art/theme/verifier/hound-beside-squad.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b verifier capture: Hound and the four Guards in a phone crop |
| `docs/art/theme/verifier/meadow-landscape-1x.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b verifier capture: Meadow staged crowd, landscape 1x |
| `docs/art/theme/verifier/riverbend-landscape-1x.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b verifier capture: Riverbend staged crowd, landscape 1x |
| `docs/art/theme/verifier/riverbend-phone-1x.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b verifier capture: Riverbend staged crowd, phone 1x |
| `docs/art/theme/verifier/switchback-landscape-1x.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b verifier capture: Switchback staged crowd, landscape 1x |
| `docs/art/theme/verifier/tar-burn-main-over-branch.jpg` | `scripts/art/review_theme.ts` | Tarpit agents | MIT | Milestone 44b verifier capture: Tar and burn tints, main (top) over 44b (bottom) |
| `assets/fonts/OFL.txt` | https://github.com/google/fonts/blob/main/ofl/librecaslontext/OFL.txt | The Libre Caslon Text Project Authors | SIL OFL 1.1 | License file: assets/fonts/OFL.txt; SHA-256: a294245c822c5aa9fd9a9f3189418e99415428be5fecadf797793d5d8f6a3ad3 |
| `assets/fonts/LibreCaslonText-Bold-latin.woff2` | https://fonts.gstatic.com/s/librecaslontext/v5/DdT578IGsGw1aF1JU10PUbTvNNaDMfID8vdkPx6esdPs.woff2 | The Libre Caslon Text Project Authors | SIL OFL 1.1 | License file: assets/fonts/OFL.txt; SHA-256: 7dc7dc90fb6e140dcdfbfd85aae2bab1f368a448be129fecb953a8290501cef8 |
| `assets/fonts/LibreCaslonText-Regular-latin.woff2` | https://fonts.gstatic.com/s/librecaslontext/v5/DdT878IGsGw1aF1JU10PUbTvNNaDMfq41-JJHRO0.woff2 | The Libre Caslon Text Project Authors | SIL OFL 1.1 | License file: assets/fonts/OFL.txt; SHA-256: 1471d8a9f22ba5c42c597c2dc582030297027d3e4c3b59a55aec81678f80485b |
| `assets/art-painted/town-1x.png` | `scripts/art/town.py` | Tarpit agents | MIT | Original painted exit miniatures in two layouts |
| `assets/art-painted/town-1x.json` | `scripts/art/town.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/town-2x.png` | `scripts/art/town.py` | Tarpit agents | MIT | Original painted exit miniatures in two layouts |
| `assets/art-painted/town-2x.json` | `scripts/art/town.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/sack-1x.png` | `scripts/art/town_sack.py` | Tarpit agents | MIT | Original painted buckskin purse with coin seal |
| `assets/art-painted/sack-1x.json` | `scripts/art/town_sack.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/sack-2x.png` | `scripts/art/town_sack.py` | Tarpit agents | MIT | Original painted buckskin purse with coin seal |
| `assets/art-painted/sack-2x.json` | `scripts/art/town_sack.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/royal-hoist-1x.png` | `scripts/art/royal_hoist.py` | Tarpit agents | MIT | Separate town and royal cloth for the banner hoist |
| `assets/art-painted/royal-hoist-1x.json` | `scripts/art/royal_hoist.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/royal-hoist-2x.png` | `scripts/art/royal_hoist.py` | Tarpit agents | MIT | Separate town and royal cloth for the banner hoist |
| `assets/art-painted/royal-hoist-2x.json` | `scripts/art/royal_hoist.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/tossed-hat-1x.png` | `scripts/art/town.py` | Tarpit agents | MIT | Separate painted felt hats tossed by the townsfolk |
| `assets/art-painted/tossed-hat-1x.json` | `scripts/art/town.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/tossed-hat-2x.png` | `scripts/art/town.py` | Tarpit agents | MIT | Separate painted felt hats tossed by the townsfolk |
| `assets/art-painted/tossed-hat-2x.json` | `scripts/art/town.py` | Tarpit agents | MIT | Centered frame layout |
| `assets/art-painted/town-portraits/untouched.webp` | `scripts/art/town_portraits.py` | Tarpit agents | MIT | Original result-page town in its untouched condition |
| `assets/art-painted/town-portraits/scuffed.webp` | `scripts/art/town_portraits.py` | Tarpit agents | MIT | Original result-page town in its scuffed condition |
| `assets/art-painted/town-portraits/battered.webp` | `scripts/art/town_portraits.py` | Tarpit agents | MIT | Original result-page town in its battered condition |
| `assets/art-painted/town-portraits/taken.webp` | `scripts/art/town_portraits.py` | Tarpit agents | MIT | Original result-page town in its taken condition |
| `assets/art-showpiece/showpiece-pasture-1x.webp` | `scripts/art/showpiece_pasture.py` | Tarpit agents | MIT | Original Meadow scenery atlas at 1× |
| `assets/art-showpiece/showpiece-pasture-2x.webp` | `scripts/art/showpiece_pasture.py` | Tarpit agents | MIT | Original Meadow scenery atlas at 2× |
| `assets/art-showpiece/showpiece-pasture.json` | `scripts/art/showpiece_pasture.py` | Tarpit agents | MIT | Scenery frame bounds and pivots |
| `docs/art/showpiece/landscape-crossfire.jpg` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Free play Meadow, mixed towers and collectors in wave 8 |
| `docs/art/showpiece/landscape-dusk.jpg` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Campaign level 1 landscape dusk capture |
| `docs/art/showpiece/landscape-morning.jpg` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Campaign level 1 landscape morning capture |
| `docs/art/showpiece/landscape.mp4` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Campaign level 1 landscape recording |
| `docs/art/showpiece/phone-crossfire.jpg` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Campaign level 1 phone crossfire capture |
| `docs/art/showpiece/phone-dusk.jpg` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Campaign level 1 phone dusk capture |
| `docs/art/showpiece/phone-morning.jpg` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Campaign level 1 phone morning capture |
| `docs/art/showpiece/phone.mp4` | `scripts/art/m47Media.ts` | Tarpit agents | MIT | Campaign level 1 phone recording |
| `public/assets/keep/crown-wide-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Belfry, observatory and inhabited ward in wide perspective |
| `public/assets/keep/crown-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Belfry, observatory and inhabited ward |
| `public/assets/keep/drift-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Wind-driven scud |
| `public/assets/keep/far-wide-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Rear ward and spires in wide perspective |
| `public/assets/keep/far-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Rear ward and spires |
| `public/assets/keep/gate-wide-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Vaulted passage, curtain wall and gun decks in wide perspective |
| `public/assets/keep/gate-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Vaulted passage, curtain wall and gun decks |
| `public/assets/keep/glow-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Torch and brazier light spill |
| `public/assets/keep/landscape-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Wide crag, ravine and ruined crossing |
| `public/assets/keep/lightning-wide-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Whole-model lightning exposure in wide perspective |
| `public/assets/keep/lightning-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Whole-model lightning exposure |
| `public/assets/keep/mist-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Road fog |
| `public/assets/keep/plinth-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Marked stone tower footprint |
| `public/assets/keep/portrait-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Portrait crag, ravine and gate approach |
| `public/assets/keep/road-wide-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Raised wide approach, barbican and stairs |
| `public/assets/keep/siege-blockade-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Stone and timber road closure |
| `public/assets/keep/siege-east-deck-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Thin eastern road deck at the curtain wall |
| `public/assets/keep/siege-gates-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Barbican and four gate conditions |
| `public/assets/keep/siege-portrait-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Converging roads, ravine and terraced yard in portrait |
| `public/assets/keep/siege-wide-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Converging roads, ravine and terraced yard in landscape |
| `public/assets/keep/sky-dawn-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Cold dawn and first light |
| `public/assets/keep/sky-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Storm shelf and western light shafts |
| `public/assets/keep/sky-night-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Night storm sky |
| `public/assets/keep/strike-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Hard lightning key on the keep in portrait |
| `public/assets/keep/strike-wide-half.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Half-size plate. Hard lightning key on the keep in landscape |
| `public/assets/keep/wings-half.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Half-size plate. Portrait scenery beyond the playable field |
| `public/assets/keep/crown-wide.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Belfry, observatory and inhabited ward in wide perspective |
| `public/assets/keep/crown.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Belfry, observatory and inhabited ward |
| `public/assets/keep/drift.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Wind-driven scud |
| `public/assets/keep/far-wide.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Rear ward and spires in wide perspective |
| `public/assets/keep/far.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Rear ward and spires |
| `public/assets/keep/gate-wide.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Vaulted passage, curtain wall and gun decks in wide perspective |
| `public/assets/keep/gate.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Vaulted passage, curtain wall and gun decks |
| `public/assets/keep/glow.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Torch and brazier light spill |
| `public/assets/keep/landscape.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Wide crag, ravine and ruined crossing |
| `public/assets/keep/lightning-wide.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Whole-model lightning exposure in wide perspective |
| `public/assets/keep/lightning.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Whole-model lightning exposure |
| `public/assets/keep/mist.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Road fog |
| `public/assets/keep/plinth.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Marked stone tower footprint |
| `public/assets/keep/portrait.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Portrait crag, ravine and gate approach |
| `public/assets/keep/road-wide.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Raised wide approach, barbican and stairs |
| `public/assets/keep/siege-blockade.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Stone and timber road closure |
| `public/assets/keep/siege-east-deck.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Thin eastern road deck at the curtain wall |
| `public/assets/keep/siege-gates.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Barbican and four gate conditions |
| `public/assets/keep/siege-portrait.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Converging roads, ravine and terraced yard in portrait |
| `public/assets/keep/siege-wide.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Converging roads, ravine and terraced yard in landscape |
| `public/assets/keep/sky-dawn.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Cold dawn and first light |
| `public/assets/keep/sky-night.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Night storm sky |
| `public/assets/keep/sky.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Storm shelf and western light shafts |
| `public/assets/keep/strike-wide.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Hard lightning key on the keep in landscape |
| `public/assets/keep/strike.webp` | `scripts/art/keep_castle.py` | Tarpit agents | MIT | Hard lightning key on the keep in portrait |
| `public/assets/keep/wings.webp` | `scripts/art/keep_weather.py` | Tarpit agents | MIT | Portrait scenery beyond the playable field |
| `docs/review/m51/keep-1024x768.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Production game capture |
| `docs/review/m51/keep-390x664.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Production game capture |
| `docs/review/m51/keep-390x844.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Production game capture |
| `docs/review/m51/keep-960x580.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Production game capture |
| `docs/review/m51/keep-dusk-detail.jpg` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Native-scale runtime study |
| `docs/review/m51/keep-layers.jpg` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Native-scale runtime study |
| `docs/review/m51/keep-lightning-detail.jpg` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Native-scale runtime study |
| `docs/review/m51/keep-phone.mp4` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Production game capture |
| `docs/review/m51/keep-390x664-midwave.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Short-phone mid-wave readability |
| `docs/review/m51/keep-phone-comparison.png` | `scripts/art/keep_review.py` | Tarpit agents | MIT | Registered first and second phone captures |
| `docs/review/m51/keep-phone-zoom.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Magnified phone scene |
| `docs/review/m51/keep-phone-full-vs-half.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Phone-size crop with full source on the left and half-size source on the right |
| `docs/review/m51/keep-loading.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Phone loading progress with one plate pending |
| `docs/review/m51/keep-load-failed.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Phone recovery screen after a blocked glow request |
| `docs/review/m51/keep-wall-defence.png` | `scripts/art/m51Media.ts` | Tarpit agents | MIT | Production game capture |
| `docs/review/m52c2a/1024x768-level-23.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x664-level-23.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x664-outer-gate-midwave.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-before.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-level-21.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-level-22.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-level-23.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-level-24.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-level-25.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-lightning.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/390x844-outer-gate-midwave.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/960x580-level-23.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/gate-cracked.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/gate-open.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/gate-sound.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/gate-splintered.jpg` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
| `docs/review/m52c2a/level-23-phone.mp4` | `scripts/art/m52c2aMedia.ts` | Tarpit agents | MIT | Production siege capture |
