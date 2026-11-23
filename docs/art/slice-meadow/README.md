# Painted Meadow

**Enemies are as easy to see as in the current game at both sizes.** In a check with Goblins placed at the same points around the first bend, I could follow each figure through the turn. The smallest ordinary pose is 23 px tall at 20 px per cell.

**Towers are as easy to find at both sizes.** An independent reviewer correctly named all six in a shuffled strip at 20 px per cell. Tar Pit was the tentative match. The black kettle reads clearly, but its contents are harder to identify in isolation. Human recognition within one second remains unmeasured.

**The trail is as easy to trace at both sizes.** Its 40 px band stays continuous through all seven segments. A boss covers part of the surface, but the entrance and exit of its bend remain visible. These judgments apply to the still frames. The previous report overstated what its phone plate established about playability.

[Compare desktop at 1×](meadow-comparison.png) · [Compare the phone captures at their native size](meadow-comparison-phone.png) · [Inspect the phone-size tower strip and silhouettes](meadow-contact.png)

## Piece measurements

Heights in screen pixels. The previous column measures the opaque extent in commit `661a7f3`, which includes platforms modelled into those towers. The new measurements use visible body pixels, excluding the added ink rim, disc, shadow, labels, and HP bars. The 1× and 20 px columns cover every bearing and walk phase. The phone capture column measures the poses in the published mid-wave composition at their actual positions.

| Piece | Previous 1× | New 1× | At 20 px per cell | In the phone capture |
|---|---:|---:|---:|---:|
| Goblin | 16–25 | 36–40 | 23–25 | 28–29 |
| Wolf | 22–35 | 36–40 | 23–25 | 26 |
| Harpy | 16–29 | 36–40 | 23–25 | 27–29 |
| Shieldbearer | 18–25 | 36–40 | 23–25 | 26–27 |
| Troll | 22–30 | 54–58 | 34–36 | 38–39 |
| Grumblefoot | 28–41 | 82–86 | 51–53 | 61 |
| Grumblemaw | 36–47 | 90–94 | 57–59 | 65 |
| Musketeer | 28–41 | 40 | 25 | 28 |
| Cannon | 29–35 | 40 | 25 | 29 |
| Tar Pit | 25–29 | 40 | 25 | 28 |
| Longbow | 32–36 | 40 | 25 | 28 |
| Mortar | 28–29 | 40 | 25 | 28 |
| Fire Pot | 28–34 | 40 | 25 | 29 |

Tower bodies span 28–46 px in width across their 96 headings at 1×. Each stands on a 33 px disc centred on its build cell. The upright Musketeer carries one long rifle, the Cannon has two wheels, and the Tar Pit has a hanging kettle bail. The Longbow shows the opening between stave and string, the Mortar has a short upward-facing bore, and the Fire Pot has a forked orange and gold flame. The ground camera stays overhead. The tower camera moves from 65° to 48° above the horizon so a wheel, a barrel side and the figure’s face occupy more pixels. Enemies and scenery keep the 65° view. [Camera study](camera-study.png)

Grumblefoot now has a copper body, burgundy mantle, two ivory horns and a studded iron club. The Troll keeps its green hide and smaller wooden club. Four oak crowns vary in height, branching, size and rotation. Muted foliage, softer stipple and fewer flowers near the route leave a quieter background to the units’ dark rims. The umber trail edge follows the original bends.

## Game frames

| Scene | Desktop with HUD | Map only | Portrait with status and controls |
|---|---|---|---|
| Before wave 1 | [1×](meadow-before-1x.png) · [2×](meadow-before-2x.png) | [1×](meadow-before-map-1x.png) · [2×](meadow-before-map-2x.png) | [Phone](meadow-before-phone.png) |
| Mid-wave | [1×](meadow-mid-wave-1x.png) · [2×](meadow-mid-wave-2x.png) | [1×](meadow-mid-wave-map-1x.png) · [2×](meadow-mid-wave-map-2x.png) | [Phone](meadow-mid-wave-phone.png) |

The desktop frame is 960 × 580. Its HUD starts at y = 480. The portrait capture is 340 × 844. Its map occupies 339 × 678 at (0, 54), giving 22.6 px per cell. The rightmost capture column, top status strip and two bottom control rows come directly from the reference. The compositor copies the HUD pixels from the corresponding tracked setup or mid-wave screenshot. The 2× desktop plate doubles each HUD pixel. [Desktop mid-wave source](../../../e2e/__screenshots__/visual.spec.ts/mid-wave.png) · [Phone mid-wave source](../../../e2e/__screenshots__/visual-phone.spec.ts/phone-midwave.png)

The scene stages six towers on legal cells and 18 enemies, including both bosses, to expose the whole roster. The reference HUD keeps its original wave, gold and controls. This composition also shows five HP bars over hurt enemies, a dark tar ring on the Shieldbearer, an orange burn ring on the Wolf, the Musketeer’s 110 px range, and one valid placement cell. Desktop tower names use the game’s short labels. The campaign encounters the two bosses on separate waves.

## Atlas and verification

Each PNG has a JSON neighbour. `frameSize` and `anchor` use texture pixels at the file’s density. `bodyBounds` gives each actor’s measured body rectangle within its frame as left, top, right and bottom, with exclusive right and bottom edges. Use the fixed ground anchor for placement, and the top body edge for the HP bar. Divide texture dimensions by density for world dimensions.

Towers keep 16 clockwise headings beginning at north, with eight frames per row. Enemies have four walk phases across each of four direction rows in N, E, S, W order. The oak sheet has four variants, and the cave has landscape and portrait openings. In portrait, rotate the ground clockwise and map each anchor to (480 − y, x). Turn tower headings forward by four and enemy headings by one, then draw the miniatures upright. The Harpy has a separate soft shadow beneath its disc.

Rebuild from this worktree with the installed Blender 4.5 and Python/Pillow.

```sh
python3 scripts/art/build_slice.py
```

Checks covered 54 PNG/JSON pairs, all 450 sprite cells at the two densities, transparent gutters, anchors, body sizes, six build cells, the placement cell, and both full comparisons. Pixel comparisons verified the source HUD regions, the original and painted halves of each comparison, and both desktop map crops. Motion and physical-handset recognition remain untested.

| Bytes on disk | 1× | 2× |
|---|---:|---:|
| Ground and sprite PNGs | 577,757 | 1,613,903 |
| Atlas JSON | 16,292 | 16,589 |
| Total at one density | 594,049 | 1,630,492 |

The 14 PNG review plates use 6,730,979 bytes. The review plates and both densities of asset PNGs together use **8,922,639 bytes**.

The asset manifest covers 155 files, including the generated art from both spikes. The validator accepts their Python generators. The runtime checks could not run in this worktree because ESLint, TypeScript, Vitest, Vite and Playwright are absent. The runtime size check requires a built `dist/` directory.
