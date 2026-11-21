# Asset manifest

Every file under `assets/` and `docs/art/` is listed here with its source,
author and license. Only CC0, or CC-BY with a credit line in Notes
(`Credit: ...`), may be committed (docs/SCOPE-v3.md, "Hard rules").
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
