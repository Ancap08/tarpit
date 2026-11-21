# Art source inventory (milestone 15)

Two CC0 pixel-art packs were downloaded by the coordinator and inspected
for Tarpit's roster: three enemies, six towers, the map, effects, HUD and
sound. Nothing from them is in the repo except the mockups in
`docs/art/mockups/`, which are composites of a game screenshot and sprite
crops (listed in `assets/MANIFEST.md`).

Sizes and sheet layouts below were read with Pillow; facing directions
were checked by eye on 4x and 8x zooms. Pack paths are relative to each
pack's root folder.

## The packs

| | Ninja Adventure | 0x72 DungeonTileset II v1.7 |
|---|---|---|
| Source | https://pixel-boy.itch.io/ninja-adventure-asset-pack | https://0x72.itch.io/dungeontileset-ii |
| Author | Pixel-boy and AAA | 0x72 |
| License | CC0. `LICENSE.txt` first line: "CC0 1.0 Universal"; `README.md`: "They are released under the Creative Commons Zero (CC0) license." | CC0. The zip has **no license file** (only a `README` about autotiles). The itch.io page states "Asset license: Creative Commons Zero v1.0 Universal" (fetched 2026-11-21). Record that page as the license source in the manifest. |
| Size | 94 MB zip, 110 MB unzipped: Audio 96 MB (music 60 MB, sounds 32 MB, jingles 4 MB), Actor 6.5 MB, Ui 1.7 MB, FX, Items and Backgrounds about 0.6 MB each | 416 kB zip, 1.5 MB unzipped (370 single-frame PNGs plus atlases) |
| Base size | 16 px tiles and characters; bosses 37 to 82 px | 16 px tiles; characters 16x16, 16x23 or 16x28; big ones 32x36 |
| Characters (`Actor/Character/<Name>/SpriteSheet.png`, 92 of them) | 64x112 sheet of 16x16 cells. **Columns are directions: down, up, left, right.** Rows 0 to 3: walk (4 frames); row 4: attack; row 5: jump; row 6: dead, item, special. `SeparateAnim/` repeats these: Walk 64x64, Idle/Attack/Jump 64x16 (1 frame per direction), Dead 16x16 (1 frame, one facing) | 4 idle + 4 run frames, **facing right only** (flip for left). Heroes (knight, elf, dwarf, lizard, wizard) add 1 hit frame. **No death frames for anything.** |
| Monsters (`Actor/Monster/<Name>/`, 65) | 64x64 sheet: same 4 direction columns x 4 walk frames. **Walk only: no idle, hit or death** | 23 enemies: goblin, imp, chort, wogol, orc warrior, orc shaman, masked orc, ogre, big demon, big zombie, zombie, tiny zombie, ice zombie, skelet, swampy, muddy, slug, tiny slug, necromancer, pumpkin dude, doc, angel. Idle 4 + run 4, or a 4-frame loop |
| Animals (`Actor/Animal/`, 26) | Tiny side-view sheets: Hyena 28x13 = 2 frames of 14x13 facing left; Dog 32x16 = 2 frames; Lion has 4-direction 32x23 and side 60x16 sheets. No death | none |
| Bosses (`Actor/Boss/`, 20) | Strips per state: DemonCyclop Walk 300x50 (6 frames of 50x50), Idle 5, Hit 3; GiantRacoon Idle 360x60 (6 of 60x60), Attack, Charge, Jump; one facing | big_demon, big_zombie, ogre (32x36), idle and run |
| Tilesets | Field (5 colour patches: dirt orange, two greens, pink, white, each a 3x3 rounded 9-slice plus a 2x2 plain fill), Nature (trees, bushes, tufts, flowers, rocks), House (houses, huts, igloos, fences, statues), Relief and ReliefDetail (cliffs, mine entrances), Towers (12 x 3 towers of 32x32), Hole, Water, Desert, Dungeon, Floor, Village, Interior | Dungeon floors, walls, doors, columns, fountains, chests, flasks, crates, a bomb (3 frames), coin (4 frames), arrow, bows. **No grass, dirt path, buildings or towers** |
| FX | `FX/Elemental/Explosion` 360x40 (9 frames of 40x40), `Flam` 200x30, `Water` 440x33 (splash), `Rock` 420x30, `Smoke/Smoke` 192x32 (6 of 32x32), `Particle/Fire` 96x12 (8 of 12x12), `Projectile/CanonBall` 80x16 (5 of 16x16), `Projectile/Arrow` 13x5, Fireball, slashes | none |
| UI | `Ui/Theme/Theme Wood` (button 16x8 9-slice in normal, hover, pressed, disabled; panels 16x16; tabs; sliders), `Ui/Receptacle/LifeBarMini*` 18x4 hp bar, hearts, dialog boxes, keyboard and gamepad glyphs, 12 WIP themes | none |
| Audio | 132 WAV effects in 11 folders (Alert, Ambient, Bonus, Creature, Elemental, Hit & Impact, Jump & Bounce, Magic & Skill, Menu, Voice, Whoosh & Slash), 15 jingles (GameOver, LevelUp, Success, Secret), 41 OGG music tracks of 2 to 4.5 MB each | none |

## Roster mapping

Fit: 5 = use as is, 4 = good with a rename or recolour, 3 = usable stand-in,
2 = poor, 1 = nothing usable. "NA" is Ninja Adventure. Audio cells were
picked by file name only; nobody has listened to them yet.

| Roster item | Ninja Adventure candidate | NA gap | Fit | 0x72 candidate | 0x72 gap | Fit |
|---|---|---|---|---|---|---|
| Goblin (small, green, r 10) | `Actor/Character/GreenPig/SpriteSheet.png` (green, pointed ears, orc-like). Alternates: `Actor/Character/DemonGreen`, `Actor/Monster/KappaGreen` | Reads as a pig-orc, not a goblin. Has walk, attack and a 1-frame dead; no hit frame | 4 | `frames/goblin_run_anim_f0..3.png`, `goblin_idle_anim_*` (16x16, body about 11 px) | Right-facing only, no hit, no death; tiny at 2x | 4 |
| Wolf (fast, grey, r 8) | `Actor/Animal/Hyena/SpriteSheet.png` (grey, 2 frames 14x13). Alternate with 4 directions: `Actor/Monster/Beast2/Beast2.png` (dark grey beast) | Hyena: side view only, 2 frames, no death; Beast2 is a blob, not a wolf | 3 | none. Stand-in `frames/imp_run_anim_*` (small, red, fast-looking) | No canine at all | 1 |
| Troll (big, brown, r 16) | `Actor/Monster/Cyclope/SpriteSheet.png` (red one-eyed brute). Alternates: `Actor/Monster/Bear`, `Actor/Monster/Beast`; a boss-size Troll could use `Actor/Boss/DemonCyclop` (Walk 6, Hit 3) | Same 16 px size as the Goblin, so it cannot look bigger at one scale; no death; red, not brown | 3 | `frames/ogre_run_anim_*` (32x36, green ogre with a brown hide) | Right-facing only, no hit or death; twice the size of 16 px sprites (good for a Troll) | 4 |
| Musketeer | `Actor/Character/Noble` (wide black hat, reads colonial) | No gun; the attack row is a melee pose | 3 | none (heroes are knight, elf, dwarf, wizard) | No ranged gunner | 1 |
| Cannon | `Actor/Character/Knight` as a gunner; `FX/Projectile/CanonBall.png` for the shot. `Backgrounds/Tilesets/TilesetTowers.png` grey stone tower (32x32) | No cannon sprite anywhere | 2 | none | | 1 |
| Tar Pit | `Backgrounds/Tilesets/TilesetNature.png` hole tile (112,208); `Backgrounds/Animated/QuickSand/QuickSand32x32.png` (8 frames, a swirling pit) | QuickSand is sand-coloured: needs a dark recolour for tar | 3 | none (floor spikes and fountains only) | | 1 |
| Longbow | `Actor/Character/Hunter`; `Items/Weapons/Bow/Sprite.png` and `Arrow.png` | Bow is a separate item, not in the character's hands | 3 | `frames/weapon_bow.png`, `weapon_arrow.png` (items only) | No archer tower | 2 |
| Mortar | `Actor/Character/NinjaBomb`; `Items/Projectile/Bomb.png` (12x13) as the shell | No mortar piece | 2 | `frames/bomb_f0..2.png` as the shell | No tower | 1 |
| Fire Pot | `Actor/Character/NinjaFire`; TilesetTowers red flame tower; `FX/Particle/Fire.png` | Fine as a brazier tower | 3 | `frames/flask_big_red.png` as the thrown pot | No tower | 2 |
| Projectiles | CanonBall (5 frames), Arrow 13x5, Bomb, Fireball, Rock; musket ball is a 2 px dot drawn in code | None needed beyond a musket tracer | 4 | weapon_arrow 7x21, bomb, flasks | No cannonball | 2 |
| Grass | `TilesetField.png` dark green plain fill (48,96) and its 9-slice; tufts from `TilesetNature.png` (48..80,160) | The plain tile has dark speckles that look busy when tiled at 2x | 4 | none | Dungeon floors only | 1 |
| Dirt path | `TilesetField.png` orange patch: 9-slice (0,0,48,48) and plain fill (48,0) | 9-slice corners are 16 px squares; our 40 px wide polyline needs a path drawn as a mask (as in the mockup) or a 48 px wide tiled path | 4 | none | | 1 |
| Cave (spawn) | `TilesetReliefDetail.png` grey mine entrance (0,112,48,56); also a dark arch at (16,0) | Faces the viewer, the path leaves sideways; at 3x it is 144x150 px | 4 | wall and door tiles could fake a dungeon door | Indoor look | 2 |
| Cottage (exit) | `TilesetHouse.png` first house (0,0,64,48); smaller thatched hut at (48,128) | 64x48 is 192x144 px at 3x, five times our 36x37 cottage box | 4 | none | | 1 |
| HUD skin | `Ui/Theme/Theme Wood/button_normal.png` (+ hover, pressed, disabled) as a 9-slice; `nine_path_panel.png` for the tower panel; `Ui/Receptacle/LifeBarMini*` for hp bars | No font in the pack's style is used (`Ui/Font` holds `NormalFont.ttf` and two bitmap fonts, license covered by the pack but not tried) | 4 | none | | 1 |
| Fire effect | `FX/Particle/Fire.png` (8 of 12x12), `FX/Elemental/Flam` (7 frames) | | 5 | none | | 1 |
| Smoke | `FX/Smoke/Smoke/SpriteSheet.png` (6 of 32x32), `SmokeCircular` | | 5 | none | | 1 |
| Explosion | `FX/Elemental/Explosion/SpriteSheet.png` (9 of 40x40) | 120 px at 3x: large next to 48 px enemies | 5 | none | | 1 |
| Splash (cannon, mortar) | Explosion frames 6 to 8 (dust ring), `FX/Smoke/SmokeCircular` (ground puff), `FX/Elemental/Rock` (debris) | `Elemental/Water` is a water splash, not a shot splash | 4 | none | | 1 |
| Shot sound | `Audio/Sounds/Elemental/Explosion*.wav` (cannon, mortar), `Whoosh & Slash/Launch.wav` and `Whoosh.wav` (arrow, fire pot) | No gunshot by name for the Musketeer | 3 | none (no audio) | | 1 |
| Hit sound | `Audio/Sounds/Hit & Impact/Hit1..9.wav`, `Impact*.wav` | | 5 | none | | 1 |
| Death sound | `Hit & Impact/Impact*.wav`, `Voice/Voice*.wav` (creature voices) | No death cry by name | 3 | none | | 1 |
| Coin | `Audio/Sounds/Bonus/Coin.wav`, `Coin2`, `Gold1` | | 5 | none | | 1 |
| Build | `Audio/Sounds/Menu/Accept*.wav`, `Bonus/PowerUp1.wav` | No hammer or construction sound | 3 | none | | 1 |
| Wave horn | `Audio/Sounds/Alert/Alert*.wav` | No horn by name | 2 | none | | 1 |
| Win | `Audio/Jingles/Success1..4.wav`, `LevelUp*.wav` | | 5 | none | | 1 |
| Lose | `Audio/Jingles/GameOver.wav`, `GameOver2..4.wav` | | 5 | none | | 1 |
| Music | `Audio/Musics/33 - Calm Village.ogg` (2.3 MB), `35 - Adventure.ogg` (3.0 MB), `17 - Fight.ogg`; 41 tracks | One looping track fits the 20 MB budget; the Japanese flavour of some tracks is unchecked by ear | 4 | none | | 1 |

### Worst gaps

- **No death animations for enemies in either pack.** Ninja Adventure
  characters have a single dead frame (one facing); monsters and animals
  have none; 0x72 has none at all. Milestone 16's "die" state will be a
  code effect (fade, pop, squash, particles) whatever we pick.
- **No hit frames** for NA monsters or any 0x72 enemy: hit flashes must be
  a tint in code (planned for milestone 19 anyway).
- **No towers that match our six.** NA has characters, a 32x32 tower
  tileset in a different (larger) pixel density, and no cannon or mortar
  piece. 0x72 has no towers at all.
- **No wolf in 0x72**; NA's only canines are 2-frame side-view animals.
- **Scale.** Everything 16 px at 3x is 48 px: bigger than our 32 px cell
  and our 40 px path, and a 16 px Troll is the same size as a 16 px
  Goblin. NA buildings are 48 to 64 px wide (144 to 192 px at 3x). At 2x
  the 16 px grid lines up with our 32 px cells and the sizes match today's
  shapes (see `A-ninja-adventure-2x.png`).

## Mockups

All mockups were built from one screenshot of the current game (production
build, `?test=1`): wave 5 (`state.wave = 4`, then Start Wave) with a
Musketeer at (15,10), Cannon (18,10), Tar Pit (11,9), Longbow (23,8),
Mortar (17,6) and Fire Pot (24,11), stepped 1000 ticks: 5 Goblins and 2
Trolls are on the path, one Goblin hurt and tarred. Wave 5 has no Wolves,
so A and B add a small roster panel bottom left with all three
stand-ins. Sprites sit at the real enemy positions from `state()` and face
along the path. Scaling is nearest-neighbour only.

| File | What it shows |
|---|---|
| `mockups/A-ninja-adventure.png` | A at 3x (the scoped scale): Field grass with Nature tufts, the real path shape filled with the Field dirt tile and a darker rim, the grey mine as the cave, the first TilesetHouse house as the cottage, characters as towers, a cannonball leaving the Cannon, an explosion (frame 4) on the troll, and the build bar skinned with Theme Wood buttons |
| `mockups/A-ninja-adventure-2x.png` | The same scene at 2x, for the scale decision (not in the brief; added because 3x crowds the grid) |
| `mockups/B-0x72.png` | 0x72 enemies at 2x over the current shapes map and shape towers: the mixed option as it would really look |
| `mockups/C-shapes-animated.png` | The current art untouched, a banner, and three insets of code animation: Goblin squash and stretch, Musketeer recoil with flash and smoke, a coin floater |
| `mockups/closeups.png` | Goblin, Wolf, Troll and Musketeer: today's shape, the A stand-in (walk frames, plus the dead frame where one exists) and the B stand-in, at 4x |

B uses 2x, not 3x: the 0x72 ogre is 32x36 art, so at 3x it would be
96x108 px on a 40 px path. One pixel scale per scene keeps the pixel
density consistent.

### Stand-ins chosen

- **Goblin, A: `Actor/Character/GreenPig`.** Green, pointed ears and
  tusks: the closest to a goblin in the pack, and as a Character it has the
  only dead frame. KappaGreen (the coordinator's first idea) is a turtle
  with a water dish on its head, which reads as a kappa, not a goblin.
- **Wolf, A: `Actor/Animal/Hyena` (grey).** The only grey canine. The
  cost: side view only, 2 frames, so it slides when walking up or down.
- **Troll, A: `Actor/Monster/Cyclope`.** A heavy one-eyed brute reads as
  the tank. Bear looked like an animal, not a monster.
- **Towers, A:** Musketeer Noble (black wide hat, the most colonial
  silhouette), Cannon Knight, Longbow Hunter, Mortar NinjaBomb (carries a
  bomb), Fire Pot NinjaFire, Tar Pit the Nature hole tile. Characters were
  used instead of `TilesetTowers.png` because those towers are 32x32: at
  3x they would cover nine cells.
- **B: `goblin`, `imp` for the Wolf (small, fast, no canine exists),
  `ogre` for the Troll.**

## Recommendation

**Pick A (Ninja Adventure), but at 2x, not 3x, and plan to rename the
enemies.** It is the only option that covers enemies, map tiles,
buildings, effects, HUD skin and sound from one artist in one palette,
which is what makes v3 look like a game instead of a prototype; the 2x
mockup sits on our 32 px grid, matches today's sizes, and stays sharp
(3x crowds the 40 px path, stacks the Goblins into each other and makes
the cottage five times its box). Its main risks: the pack is Japanese
folk themed (ninjas, samurai, kappa, tengu) against our colonial-fantasy
names, so the honest fix is to rename the enemies to what the sprites
are, for example **Goblin to Orc or Pigling (GreenPig) or Kappa (if
KappaGreen is used), Wolf to Hyena, Troll to Cyclops**, and accept
character towers (a Noble as a Musketeer, a bomb ninja as a Mortar) since
the pack has no cannon or mortar; monsters have walk cycles only, so hit
and death are code effects; and a 16 px Troll is no bigger than a Goblin
unless we use a boss sprite. **B** is a real style clash (dungeon sprites
with heavy outlines on flat vector shapes), has no wolf, no towers, no
tiles, no sound and no death frames; its ogre is the best Troll in either
pack. 0x72's goblin could be recoloured to A's palette (both packs use
dark outlines and limited palettes), but its single facing and 11 px body
would still look thinner than NA's 4-direction characters, so mix it in
only as a last resort. **C** is the safe fallback: no licensing,
no size cost, deterministic, and the insets show it can add life, but it
stays a shapes game and every effect is hand-coded work in milestones 17
to 19.
