# Painted Meadow

Choose **Painted** under **Look**, select **Meadow** and press **Play**.
The title remembers your choice. Classic is the default and supplies the
art on Switchback and Riverbend. The HUD and upgrade markers are shared
by both looks.

| Review sheet | What to inspect |
|---|---|
| [Desktop comparison](meadow-comparison.png) | A 960 × 580 Classic capture beside a staged mid-wave board, with six towers around the trail. |
| [Phone comparison](meadow-comparison-phone.png) | The same concept in 340 × 844 portrait frames. The map has about 23 px per cell. |
| [Piece contact sheet](meadow-contact.png) | All six towers, seven enemies, scenery and projectiles, including tower silhouettes at 20 px per cell. |

The comparisons composite the current painted atlases into tracked Classic
captures and keep the captured HUD. They include both bosses to show their
silhouettes together. The bosses appear in separate campaign waves. View the
phone sheet and contact strip at 100% to judge piece size. Reading the pieces
in motion on a physical phone still needs a playtest.

## Atlas and rebuild

The game loads a single density for Painted Meadow. Each PNG has a JSON
neighbour. `frameSize`, `anchor` and actor `bodyBounds` use texture pixels.
The bounds are left, top, right and bottom, with exclusive right and bottom
edges. Divide these coordinates by density for game pixels. Tower frames use
16 clockwise headings beginning north. Enemy frames use four walk phases
per direction in north, east, south, west order.

Use Blender 4.5 and a host Python 3 with Pillow 11.3. Blender is found on
`PATH` or in the standard macOS application location.

```sh
python3 scripts/art/build_slice.py
```

Set `TARPIT_ART_SCRATCH` to choose the scratch directory. Its default is
`/private/tmp/tarpit-art-scratch`. The full rebuild writes the camera study
under `slice/` in scratch. To recreate the desktop, map-only and phone
plates at their original sizes and refresh the three tracked review sheets,
run `python3 scripts/art/slice_mocks.py` with the packed atlases and tracked
Classic captures in place. The standalone plates go under `slice/` in
scratch. Review text uses macOS fonts when available, then DejaVu, then
Pillow's default font.
