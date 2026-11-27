# Level 21 · how far back should the keep go?

## A1

- The keep sits high in the haze. A lighter, quieter board fills about two thirds of the phone space between the status panel and build bar.
- The close-up masonry and warm torchlight give way to a smaller view of the whole keep.
- **Medium work for levels 21–25.** Repaint both boards, rerender the keep and gate, and check all three weather settings.
- The four gold sites sit on raised stone outworks. One is beside the outer gate. All ten sites stay where they are.
- Level 25 starts at **68.56 MB of 70 MB** at 390×844 DPR 3. Replace the old castle plates with a tightly cropped plate and reuse the ground, gate atlas and sprite allocations. That should free memory. Measure it in the build.

## A2

- The keep reads as a dark skyline with small lit windows. It takes under a fifth of the phone space between the status panel and build bar.
- Most of the keep’s stonework and shape disappear. More open ground shows above the road.
- **Medium work for levels 21–25.** It needs the same board, gates, and weather checks as A1. Flattening the distant stone into silhouette is a small art change.
- The four gold sites sit on the same raised stone outworks. All ten sites stay where they are.
- The shorter castle crop can use fewer decoded pixels than A1. Replace the old plates and reuse the same allocations. The retained total still needs measuring against the 70 MB cap.

## What I’d build

Build **A1**.\
The road, green build spots and gold high sites are easy to pick out.\
The distant keep still gives level 21 a place you can recognize.

## What the game build needs

- **Plates.** Rerender the distant keep for portrait and wide, including the lightning exposure. Repaint both ground plates and the east deck with the quieter stone, ridge, raised outworks and arch at the existing road end. Fit dusk, storm and dawn within the existing art budget.
- **Layers.** Bake static rock, footings and outworks into the ground. Keep the outer gate separate for damage and repair. Crop the keep, keep the weather layers, and spend the savings on headroom.
- **Sprites.** Rerender the outer gate at the road’s angle in both layouts, with all its current damage states, within the existing atlas size. Reuse the enemy sheets with a contour and a separate contact shadow under every enemy.
- **Code.** Move the backdrop and adjust its projection. Draw green sockets and gold raised sites at the existing cells. Space the crowd down the road in the draw layer and keep attack and aim cues tied to the simulation positions. On levels with usable windows, seat their art on the near defenses at the existing targets. Check Survey and Quartering markers there too.
- **Checks in play.** Verify that the queue holds together as enemies move, that attacks, taps and aim previews read correctly, and that nothing crosses controls when the camera moves or the phone rotates. Measure retained memory and frame cost with level 25’s full roster.
