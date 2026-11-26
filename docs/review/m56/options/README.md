# Three finishes for the sharper pieces

[Open the phone contact sheet](contact-sheet.webp). The three columns show the same battlefield crops at their original scale on a 390-wide DPR 3 phone.

| Finish | Six pieces beside today’s sprites | Window Money | Old Keep at night |
|---|---|---|---|
| A Soft | [Phone pixels and 2.4×](a-soft-pieces.png) | [Full frame](a-soft-mid-wave.webp) · [3× details](a-soft-mid-wave-detail.webp) | [Full frame](a-soft-old-keep-night.webp) · [3× details](a-soft-old-keep-night-detail.webp) |
| B Inked | [Phone pixels and 2.4×](b-inked-pieces.png) | [Full frame](b-inked-mid-wave.webp) · [3× details](b-inked-mid-wave-detail.webp) | [Full frame](b-inked-old-keep-night.webp) · [3× details](b-inked-old-keep-night-detail.webp) |
| C Lifted | [Phone pixels and 2.4×](c-lifted-pieces.png) | [Full frame](c-lifted-mid-wave.webp) · [3× details](c-lifted-mid-wave-detail.webp) | [Full frame](c-lifted-old-keep-night.webp) · [3× details](c-lifted-old-keep-night-detail.webp) |

- **A Soft** is already built on this branch. The rounded shading looks natural, but the thin barrel and pale shield edges take longer to find on grass. Moonlight makes the exposed pieces visible at the Keep. Overlapping pieces blend together at the gate.
- **B Inked** adds a smooth dark edge and modest shading contrast. It makes the barrels, wings, and shields quickest to read on grass. The ink is less visible against dark stone, but it helps separate bright shapes in the night crowd. This is a pose re-render and repack using the existing models. Check that the existing Keep lighting preserves the ink and that the larger trimmed poses fit the art budget.
- **C Lifted** uses B’s shading with a feathered rim, stronger foot shadows, and a stronger Harpy ground shadow. It gives pieces more weight on grass. The soft edge does less where pieces overlap and the shadows largely disappear on dark stone. This can also be baked into the pose frames and the existing Harpy shadow, with room for the wider feather in the repack.

**Pick B Inked.** It restores the silhouette that helps at play size while keeping the sharper shading. The trade-off is a bolder edge, especially on the oversized pieces in the Keep crop.

Both full frames are 1170 × 1968 physical pixels (390 × 656 CSS px at DPR 3). Window Money uses the earlier `mid-wave-390x656` fixture with the new interface. The Keep uses the same gate-crowd fixture on the night-storm level 24 with its existing siege interface. The capture script freezes each real frame and composites the finishes on the same battlefield sprites. The terrain, camera, bars, and interface are common to the three options. [Capture script](../../../../scripts/art/m56-options.ts) · [Finish and sheet script](../../../../scripts/art/m56-options.py)

The mock-ups apply the night finish over the existing moonlight. An exact match in play would need the same ordering in the art pipeline or at load time.
