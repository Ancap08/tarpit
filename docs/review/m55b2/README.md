# Milestone 55b2 · Act Three in play

The stills use Playwright WebKit. The phone emulates Safari's 390 × 656 page area at DPR 3. Setup stills hold the setup view and wave stills use the settled camera. The recording uses live motion and real taps, with enemies staged to show the window and gate damage within 12 seconds.

[12 seconds on Both Roads](656-23-siege.mp4) · Setup and road banners → Start Wave → the view settles → the west window fires → the gate takes damage.

| Level | 390 × 656 |
|---|---|
| 21 · Rent Overdue | [Repair 90](656-21-repair.png) · [Cannot afford Repair](656-21-repair-unaffordable.png) |
| 22 · Feather Beds | [Window lit](656-22-window-lit.png) · [Spent](656-22-window-spent.png) · [No targets](656-22-no-targets.png) · [Third-star warning](656-22-third-star-warning.png) |
| 23 · Both Roads | [Setup and both road banners](656-23-setup.png) · [Settled wave at 26% gate health](656-23-wave.png) |
| 24 · Quartering | [Redcoat and Pay 80](656-24-pay.png) |
| 25 · The Final Notice | [Ram at the gate](656-25-ram.png) · [Last stand](656-25-last-stand.png) · [Gate fallen](656-25-gate-fallen.png) |

| Both Roads viewport | Setup | Settled wave |
|---|---|---|
| 390 × 664 | [Banners](664-23-setup.png) | [Damaged gate](664-23-wave.png) |
| 390 × 844 | [Banners](844-23-setup.png) | [Damaged gate](844-23-wave.png) |
| 1024 × 768 | [Banners](tablet-23-setup.png) | [Damaged gate](tablet-23-wave.png) |
| 960 × 580 | [Banners](desktop-23-setup.png) | [Damaged gate](desktop-23-wave.png) |

Side by side, earlier controls on the left. [Repair](compare-656-21-repair.png) · [Lit windows](compare-656-22-window-lit.png) · [Quartering](compare-656-24-pay.png)

Placed tower bases, earlier on the left. [Classic](compare-tower-classic.png) · [Painted](compare-tower-painted.png)

| Feather barrels | Special menu | Recharge |
|---|---|---|
| Act Two · Level 14 | [Barrel description](656-14-barrel-menu.png) | [51s](656-14-barrel-wait.png) |
| Act Three · Level 23 | [Barrel description](656-23-barrel-menu.png) | [51s](656-23-barrel-wait.png) |

## Paper pages

| Level | Card | Map notes | Tips | Victory |
|---|---|---|---|---|
| 21 | [Notice](paper/21-card.png) | [Map notes](paper/21-map-notes.png) | [Tips](paper/21-tips.png) | [Result](paper/21-result.png) |
| 22 | [Notice](paper/22-card.png) | [Map notes](paper/22-map-notes.png) | [Tips](paper/22-tips.png) | [Result](paper/22-result.png) |
| 23 | [Notice](paper/23-card.png) | [Map notes](paper/23-map-notes.png) | [Tips](paper/23-tips.png) | [Result](paper/23-result.png) |
| 24 | [Notice](paper/24-card.png) | [Map notes](paper/24-map-notes.png) | [Tips](paper/24-tips.png) | [Result](paper/24-result.png) |
| 25 | [Notice](paper/25-card.png) | [Map notes](paper/25-map-notes.png) | [Tips](paper/25-tips.png) | [Result](paper/25-result.png) |

The paper treatment fits the current copy on all five levels. The new fitted game canvas gives the result sheet more width on the short phone. [Level 25 defeat](paper/25-defeat.png)

## Board width

Measured from the playable map edges in WebKit at 390 × 656. First Watch grows from 239.39 to 239.69 CSS px by reducing the action row from 92 to 91 layout units. The shortest taxed layout needs that height to preserve its 44 CSS px touch targets. The tower row retains its portrait, name and price spacing.

Both Roads uses 241.55 CSS px. Its 202-unit status area shares the upper scenery and the 480-wide board starts at y=130. The legacy Both Roads layout uses about 263.7 CSS px at this size. The new status and dock reserve more vertical room for the preview, rule, feat and named tower tiles. At 390 × 664, the new board is 244.39 CSS px wide. At 390 × 844, it is 310.45 CSS px wide.

The placed tower base changes from a 38 × 24 rounded block at 66% opacity to a 36 × 17 oval shadow at 26%. An upgraded or movable tower keeps a thin edge. The selection outline and path markers still identify the tower.

## Siege control geometry

Sizes below are layout units. Text uses the shared 11.1 CSS px floor. Touch targets keep their 44 CSS px minimum.

| Control | Earlier | Clean | Reason |
|---|---:|---:|---|
| Gate in setup, portrait | 214 × 80 | 250 × 96 | Room for percentage, warning colors and a distinct bar. |
| Repair, portrait | 212 × 80 | 302 × 96 | Room for the icon, quote and full third-star warning. |
| Gate and Repair, landscape | 196 × 62 and 176 × 62 | 222 × 63 each | Shared height and room for the warning at desktop fit. |
| Window, portrait | 108 × 80 | 154 × 96 | The window and its label share a touch target that clears adjacent sites. |
| Quartering, portrait | 100 × 80 | 142 × 96 | The pay button clears the road, gate and open tower spots in both views. |
| Keep scenery wings, portrait | 120 per side | 168 per side | Fill the wider canvas while preserving the road's scale. |
| Barrel caption, portrait and landscape | 25 and 16 | 24 and 15 | The menu gives the caption and its own padding enough height to wrap. |

The status line uses the existing gate instruction on Rent Overdue. On Quartering it returns to the existing window instruction after payment.

The normal and 1.09× Inter runs fit all siege copy. At the optional 1.15×
stress width, the Unbroken feat exceeds its slot by 0.58 CSS px at
390 × 844, 9.21 px on tablet and 7.63 px on desktop. The Quartering rule
exceeds its portrait slot by 10.14 px at 390 × 844. The fit rules omit
those lines while keeping the other labels and targets in place. A
second line for the affected text would accommodate that stress width.

## Frame cost

The [raw samples](frame-cost.json) measure Chromium WebGL on level 23 at 390 × 656, DPR 3, 4× CPU throttle and high Keep detail. Each median uses three 2.6-second samples per switch state. The gate fixture holds 30 enemies at contact and adds six window targets so the real action fires during the sample.

| Scenario | Off, main-thread ms/frame | On, main-thread ms/frame | Change |
|---|---:|---:|---:|
| 40 enemies | 9.84 | 9.98 | +1.45% |
| 30 held at the gate and a window fired | 11.94 | 11.30 | −5.36% |

The host was 73.26% CPU-idle on the second preflight sample. Both cases meet the 5% tolerance. The median frame interval was 16.67 → 16.67 ms with 40 enemies and 17.22 → 16.72 ms at the gate.

## Verification

- Lint, typecheck, the 348-row asset manifest, the production build and size checks passed. The build is 11.18 MiB against the 20 MiB budget.
- Vitest passed 3,013 tests across 144 files. The simulation passed 139 reported checks and both public campaign gates.
- Playwright passed 2,151 cases across Chromium, tablet and phone, with eight configured skips. Both isolated Keep cost cases passed. The interface isolation tests passed. The completed run served one build on port 4573. SHA-256 matched before and after for all 92 built files. Two earlier runs stopped while review corrections were still in progress.
- WebKit checks covered five levels at all five sizes with normal, 1.09× margin, stretched and blocked fonts. The layout and field-control checks passed. The recording and stills use WebKit emulation. A physical iPhone check of Safari's browser bars is still open.
