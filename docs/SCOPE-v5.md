# Tarpit v5 scope: make it cooler

Status: direction approved by Kyle on 2026-11-22 (second play notes, see
DECISIONS.md). He asked for the four changes in milestone 30 and agreed
with the order of the rest; he lets the coordinator make detail calls and
will object if he dislikes one. Milestones 31 and later get their detail
written here before each is built.

v4 locked the gameplay. Kyle's verdict after playing every difficulty:
solid and on track, with one part that felt off, the special attacks. v5
fixes that first, then makes the game look, sound and feel better without
changing what the player decides.

## Milestone 30: play-note fixes

### Specials rework

Kyle: "essentially useless and hard to use. I wasn't able to understand
how to place the attack and didn't know if it landed."

- **Aim.** Press Special (or pick one from its popup): a banner over the
  map says what to do, and the circle follows the pointer. A mouse click
  fires. On touch, a tap fires at the tap; holding shows the circle under
  the finger (lifted, as for tower drags) and releasing fires. There is no
  second confirming tap. The lifted circle decides where it lands, as for
  tower drags, so the bottom rows can be reached with the finger over the
  HUD. Special again, Escape, or a circle off the map cancels. (First
  draft: releasing over the HUD cancels. Changed in the build so the
  bottom rows are reachable; see DECISIONS.)
- **You can see it land.** Powder Keg: a blast, a short shake and a scorch
  mark that fades. Tar Barrel: a tar puddle that stays for as long as it
  works. Fire Arrows: a burning patch that stays for as long as it works. A
  small label at the spot says how many enemies it caught, or that it
  missed. The Special button shows the recharge and pulses when ready.
- **More power.** The charge is ready at each wave start and refills on a
  timer while the wave runs (starting number: 20 s), so a special is used
  several times a wave. The Tar Barrel and Fire Arrows leave a zone on the
  ground for a few seconds (starting number: 5 s; built as 8 s) that slows or burns every
  enemy inside it, flyers included. Circles get bigger (starting numbers:
  keg 90, tar 100, fire 90). One shared charge, three specials unlocked on
  waves 1, 4 and 7 as today.
- **Balance.** Headless builds fire specials the way a person would (when
  ready, at the biggest cluster), not from a per-wave search. The
  milestone 28 targets hold on every map and level, and: the combo build
  with specials is at least 3 lives better than without on Normal;
  removing any one special makes the Meadow combo strictly worse; a build
  that never fires a special still wins Normal on every map.

### Cannon range

90 to 105 px at both levels ("a little farther", Kyle), re-pinned in the
same balance pass.

### Speed

Tap the speed button for 1x and 2x as today; hold it for 3x while held.
(Kyle floated a 1 to 2 slider; the coordinator recommended this instead.)

### Gold cheat

Tap the Gold number five times within two seconds: +500 gold. The run is
marked as cheated in the HUD and saves no best score. Kyle asked for the
cheat; the marker and the score rule are the coordinator's.

### Two cosmetic defects from the automated review

The last tracer or splash replays after the win tick; hit and kill effects
are dropped for an enemy spawned in the same frame.

## Milestone 31: effects

Order set by Kyle on 2026-11-22: effects first, then the phone layout
("the animation should help too"). Everything here is drawing: the
simulation, its numbers and the balance pins do not change. Shots stay
instant in the rules; only what is drawn takes time.

- **Shots you can follow.** A musket ball with a muzzle flash and a puff
  of smoke; an arrow in flight; a cannonball on a low arc; a mortar shell
  on a high arc with a shadow on the ground; a tar glob; a gout of fire.
  Each takes a short time to arrive (about 0.1 to 0.4 s) and its impact
  (splash ring, dust, the enemy's flash) is drawn when it arrives.
- **Towers that move.** A tower turns smoothly toward its target and
  kicks back when it fires. Building, upgrading and selling each get a
  small pop.
- **Enemies that react.** A small knock when hit; a death puff sized to
  the enemy; gold that floats up from a kill (grouped when many die at
  once, so hordes stay readable); a red flash at the cottage and on the
  Lives number when one gets through.
- **Moments.** A banner when a wave starts and when it is cleared (with
  the bonus); the boss arrives with a darkened screen, his name and a
  shake, and goes down with a big burst.
- **Limits.** Shakes and flashes are small and are turned off when the
  device asks for reduced motion. Effects are pooled and capped so 120
  enemies still run at the performance floor. In test mode effects stay
  off or frozen as today, so the existing screenshot baselines do not
  change.

Not in this milestone: sound (next after the phone layout), new art,
upgrades that change a tower's look, any rule or number change.

## Milestone 32a: install to the home screen

Kyle asked for an easy way to get to the game on a phone. Small, and done
before the portrait layout so every later phone check runs full screen.

- **Add to Home Screen.** A web app manifest (name, short name, colours,
  icons, start address and scope under `/tarpit/`, display standalone) and
  the iOS tags, so the game opens from an icon with no browser bars.
- **An icon** in the game's placeholder style, drawn by a script in the
  repo (no downloaded art), in the sizes iOS and Android need, listed in
  `assets/MANIFEST.md`.
- **Fits the screen.** The game stays inside the safe area on phones with
  a notch or a home bar, and nothing is cut off in standalone mode.
- **Plays offline.** A small hand-written service worker, no new
  dependency: the page itself is fetched fresh when online so a new deploy
  shows up on the next open, built files are cached, and old caches are
  removed. The best scores are untouched.
- **README:** how to install on iPhone, iPad and Android in three lines.

## Milestone 32b: portrait layout

Kyle: "how can I make it easier to play on a phone, like vertically".
Today a tall window shows a "turn your device" card.

- **A window taller than it is wide gets a portrait layout** instead of
  the card: the map turned a quarter turn so the trail runs from the top
  of the screen to the bottom, with the controls underneath in thumb
  reach. Turning the device mid-game switches layout and keeps the game.
- **Controls sized for thumbs.** Every button at least 44 px on a 390 px
  wide phone: the six towers, Special, Start Wave and speed at the bottom;
  gold, lives, wave and the next-wave preview in a thin strip at the top.
  Tower panel, special aim, banners, boss bar, end screens and the title
  menu each get a portrait arrangement.
- **Same game.** The simulation, its numbers, the maps and the best
  scores do not change; only where things are drawn and where touches
  land. The landscape layout and its screenshot baselines stay exactly as
  they are.
- **Known limit, accepted for now:** a phone shows the whole 30 by 15
  cell map, so cells are about 20 px on screen. Placing uses the lifted
  ghost and the highlighted cell as today. If placing feels fiddly on
  Kyle's phone, a magnifier while dragging is the follow-up.

## Milestone 33: sound

Kyle chose sounds made in code over a downloaded pack (2026-11-22): no
files, no licences, almost no size, a retro sound that suits the
placeholder look.

- **Every action has a sound,** synthesized with the browser's audio
  engine: one per tower's shot and its impact; hits and deaths (lower for
  bigger enemies); an enemy getting through; build, upgrade, sell and
  button taps; the three specials; a horn at wave start and a chime at
  wave clear; the boss's arrival and fall; win and lose jingles; the gold
  cheat.
- **A mute button** on the title and in the game, in both layouts,
  remembered between visits. Sound starts on the player's first tap, as
  phones require.
- **It stays pleasant in a horde.** Repeats of the same sound are thinned
  and quietened, the number of sounds at once is capped, and a limiter
  keeps the mix from distorting, at 1x, 2x and 3x.
- **Drawing and rules do not change.** Sounds follow the same events the
  effects use, and an impact sounds when its projectile lands. Test mode
  is silent.
- **No music** in this milestone, and no sound files.

Sound cannot be judged by a screenshot or by the agents: Kyle is the
judge. The implementer renders every sound into one audio file for him to
hear before merge.

## Milestone 34: a living map

Kyle: "The map is a good place where we could make it seem complex while
remaining simple to do." Drawing only: no rule, number or map data
changes, and no new art files (shapes drawn in code, in the palette).

- **Ground with texture.** Patches of lighter and darker grass, tufts,
  small flowers and stones; a trail with pebbles, ruts and a soft edge
  instead of one flat strip. Laid out by a fixed recipe per map, so a map
  looks the same every time.
- **Things growing.** A few trees and bushes, kept away from the trail so
  they never hide enemies. Building on a cell clears what grows there;
  selling brings it back. Nothing drawn may make a buildable cell look
  blocked: the placement highlight stays the authority and must read
  clearly over the new ground.
- **Things moving.** Water that flows and glints on Riverbend; smoke from
  the cottage chimney; a slow sway in grass and trees; soft cloud shadows
  drifting across; now and then a bird or a butterfly; something alive in
  the cave mouth.
- **Readable first.** Enemies, towers, hp bars, zones and the trail must
  stand out as well as they do today. Decoration is low in contrast and
  sits under everything that matters.
- **Limits.** Static ground is drawn once; moving things are few and
  cheap; the performance floor holds. Motion stops under reduced motion.
  In test mode the map is still and the same every run, so baselines are
  stable (they change once, on purpose). Both layouts.

## Milestone 35: phone fixes

Kyle, after playing on his phone (2026-11-22): placing is easier than
before but still not easy, and "the screen will zoom out and be hard to
get centered again".

- **The page cannot zoom or drift.** No pinch zoom, no double-tap zoom, no
  scrolling or rubber-banding, in Safari and from the home-screen icon,
  wherever the finger starts (the game, the side bars, the edges). If the
  browser zooms or shifts the page anyway, the game puts itself back,
  centred, without the player doing anything.
- **Snap to the nearest valid cell.** On touch, when the spot under the
  lifted ghost cannot take the tower but a cell that can is close by
  (within about a cell and a half), the ghost jumps to that cell and shows
  that it did. Red shows only when nothing valid is near. The same for
  moving a tower in the planning phase and for tap placement. Mouse
  placement stays exact.
- **A magnifier while dragging.** On a small screen (cells under about
  28 px on screen), dragging a tower or holding a special's aim shows a
  magnified view of the spot under the ghost, placed where the thumb does
  not cover it, with the target cell marked.
- **Easier to pick a tower.** A tap near a tower selects it, not only a
  tap exactly on its cell.
- Drawing and input only: no rule or number changes. The landscape
  desktop game with a mouse behaves exactly as before.

Real phones are the test: the agents can only emulate touch, so Kyle's
phone decides whether this is fixed.

## Milestone 36: the longer game

Kyle (2026-11-22 and 23): go from 10 to 20 waves, "getting something
while you complete more levels"; specials need "a little more" damage and
to "last a little longer"; endless should be "a little harder". He
approved the shape below and was shown the reward list. One balance pass
covers all of it. Built in two parts on one branch: 36a the rules, 36b the
screen.

### Two acts, 20 waves

- Waves 1 to 10 stay close to today's. Grumblefoot still arrives at the
  end of wave 10, now as the mid-boss: beating wave 10 no longer wins.
- Waves 11 to 20 are new tables with tougher mixes of the same five enemy
  types, built to the same wave rules (spawn rate, length, crowding).
- Wave 20 ends with a second, bigger boss (working name **Grumblemaw**,
  in `names.ts` like every name). More hp than Grumblefoot, the same slow
  cap, more lives lost if he gets through. As his hp falls past two
  thirds and one third he calls a pack of Wolves from the cave.
- Clearing wave 20 wins. Keep going starts endless at wave 21.

### A reward after waves 5, 10 and 15

Clearing each of those waves offers three boons; the player picks one
before the next wave can start. The offers are fixed (no luck):

| After wave | Boon | Effect (starting numbers) |
|---|---|---|
| 5 | Long Barrels | Cannon and Mortar range +15% |
| 5 | Keen Arrows | Longbow damage +25% |
| 5 | War Chest | 100 gold now |
| 10 | Sticky Tar | Tar Pit and Tar Barrel slows last 50% longer |
| 10 | Hot Coals | Every burn does 40% more damage |
| 10 | Quick Hands | Specials recharge 30% faster |
| 15 | Stone Walls | 5 lives |
| 15 | Veteran Crews | Every tower fires 12% faster |
| 15 | Bigger Blasts | Cannon, Mortar and Powder Keg blast radius +20% |

A boon applies to towers already built and built later, for the rest of
the run, endless included. The numbers are starting points for the
balance pass; the names and what each one does are fixed.

### Stronger specials

More damage and longer effects for all three (starting numbers: Powder
Keg damage 30 to 60, tar and fire zones 8 s to 11 s, Fire Arrows burn 20
to 26 per second). Each must be clearly felt: the Powder Keg must hurt
more than small enemies.

### Harder endless

Endless repeats waves 18, 19 and 20 without the boss and grows faster
than today (starting number: hp times 1.8 per cycle, was 1.6).

### Balance

The milestone 28 and 30 targets are restated for 20 waves in the brief and
pinned as a matrix on all three maps and difficulties. In short: a build
with no towers loses early; a lazy build loses in act 1 or early act 2 on
Normal and wins on Easy; a good build wins Normal with lives to spare and
is at least 3 lives better with specials than without; a build that never
fires a special and one that always takes the first boon can both still
win Normal; no single boon is so strong that skipping it loses, or so weak
that it never changes a result; skipping anti-air still loses; Hard is
winnable with its own plan. A full game is about 20 minutes at 1x.

### The screen (36b)

The reward pick (three cards with a name, one line and a drawn icon, in
both layouts); the boons held shown small in the HUD; `Wave 3/20`; an act
banner after wave 10; the second boss with his bar, entrance, pack call
and fall; sounds for the new moments; win and endless flow; README, demo
and docs.

## Milestone 37: a second upgrade with a choice

Kyle approved this as the next build (2026-11-23) and asked that Codex
keep building, held to high standards, on "the simplest paths" so the game
stays "simple and slim". It folds in the old "towers with personality"
idea in its simplest form: an upgraded tower looks different.

- **Today** a tower has one upgrade. **New:** an upgraded tower can be
  upgraded once more, and that second upgrade is a choice between two
  paths. The choice is final for that tower (in the planning phase it can
  be undone like any upgrade bought that round).
- **Twelve paths, two per tower, each one plain idea** made only from
  numbers the game already has (range, damage, fire rate, splash, slow,
  burn). No new mechanics. Working names and ideas, numbers set in the
  balance pass:

| Tower | Path A | Path B |
|---|---|---|
| Musketeer | Sharpshooter: longer range, harder hits | Volley: fires much faster |
| Cannon | Heavy Shot: bigger blast | Quick Loader: fires faster |
| Tar Pit | Deep Tar: stronger slow | Wide Tar: longer reach |
| Longbow | War Bow: harder hits | Quick Draw: fires faster |
| Mortar | Siege Shell: much more damage | Wide Burst: much bigger blast |
| Fire Pot | Inferno: hotter burn | Lasting Flames: burns longer |

- **On screen:** the tower panel shows the two paths as two buttons, each
  with its name, price and one plain line; picking one is one tap. A
  tower shows its level and path at a glance (a small mark drawn in code,
  different per path), in both layouts. The first-upgrade look stays.
- **Balance:** the second upgrade must matter in act 2, both paths of
  every tower must be worth taking for some build, and Normal should ask a
  little more of a good player than it does now (the scripted reference
  build finishes with 19 of 20 lives today). Targets are in the brief and
  pinned as before.
- Rewards, specials, waves, bosses and maps do not change shape; their
  numbers may move in the balance pass.

## Milestone 38: the painted look, behind a switch

Kyle chose the painted-miniature look from the art spike (2026-11-23) and
said to wire it in so he can see the game in it. The art was made by
script in Blender (`scripts/art/`, `assets/art-painted/`): the Meadow
ground, six towers, seven enemies, scenery and projectiles.

- **A switch, off by default.** A "Look" choice on the title screen
  (Classic or Painted), remembered like the mute setting. Classic is
  today's game, unchanged. Painted applies on maps that have painted art
  (Meadow first); other maps stay Classic until their art exists.
- **Painted mode draws** the painted ground, towers that turn to aim,
  enemies that walk in four directions, painted scenery in place of the
  code-drawn trees, and painted projectiles. Pieces stand on their cells,
  nearer ones in front. Everything the game draws on top stays as it is:
  health bars, status rings, range circles, the placement highlight, the
  magnifier, effects, banners, the HUD.
- **Same game.** No rule, number, hit area or layout changes. Both
  layouts. Sharp art on sharp screens, normal art elsewhere; the painted
  files load only when Painted is on.
- **Honest limits:** only Meadow; tower levels and upgrade paths show
  through the existing marks, not through new art; the HUD is not
  repainted.

Kyle's phone decides whether the look goes on to the other maps.

## Milestone 39: the Barricade, and the rule it needs

Kyle (2026-11-23) wants a wall special "that holds them until it's
destroyed", later a short burst of troops, and one day a castle wall as a
last defence. All three need one rule the game does not have: something
on the trail with hp that enemies stop at and hit. This milestone adds
that rule in its smallest form and the Barricade as its first use. Troops
and the castle come later on the same rule.

- **The rule.** A blocker stands at a point on the trail and has hp.
  Walking enemies that reach it stop and attack it; each enemy type has an
  attack strength. When its hp is gone it breaks and they walk on. Flyers
  pass over. Stopped enemies can still be shot, slowed and burned, so a
  blocker bunches a crowd for splash. Bosses break blockers quickly.
- **The Barricade** is a fourth special on the shared charge, unlocked at
  wave 3. The player aims it at the trail; it snaps onto the trail and
  stands there until destroyed. One at a time: a new one replaces the
  old. It does no damage.
- **On screen:** a wooden barricade across the trail with its own hp bar,
  enemies visibly hitting it, a crash when it breaks, sounds for placing
  and breaking, in both layouts. In the Painted look it is drawn in code
  until painted art exists.
- **Balance:** the reference builds do not use the Barricade, so the
  matrix does not move. Separate checks: a build that uses it at a choke
  beside splash towers does better than the same build without it, but
  not overwhelmingly; walls alone do not win; bosses are not stalled for
  long.
- Simple and slim: one new idea (a blocker), one number per enemy (its
  attack), one new special. No pathfinding, no enemy collision, no new
  tower.

## Milestone 40: Guards, a short burst of troops

Kyle (2026-11-23): "a short troops burst, something that has like
weak-ish inf troops that do a little damage, take a little damage and then
die off". Second use of the blocking rule from milestone 39.

- **Guards** are a fifth special on the shared charge, unlocked at wave 6.
  The player aims at the trail; a squad of four guards appears there,
  standing in a short line across and along the trail.
- **Each guard is a blocker that hits back.** Walking enemies stop at the
  first guard they reach and attack it; the guard strikes one enemy in
  contact at a time for a little damage. A guard has little hp. Guards
  leave after a short time if they are still alive (starting numbers: 4
  guards, 60 hp each, 10 damage a second, 12 seconds). Flyers pass over.
  A Barricade and a squad can stand at the same time; a new squad replaces
  the old one.
- **Rule changes needed and no more:** several blockers at once; a blocker
  that deals damage to an enemy in contact; a blocker with a lifetime.
  Guards' kills pay bounty and count as special kills.
- **On screen:** four small soldiers drawn where they really stand, each
  with a small hp bar, a strike animation, and they fall or march off at
  the end; sounds; both layouts; in the Painted look a painted guard made
  by the art scripts.
- **Balance:** the reference builds do not use Guards, so the matrix does
  not move. Strength is checked by a sweep over trail points as for the
  Barricade: useful, bounded, and troops alone do not win.

## Later milestones (order agreed, detail to come)

| # | Milestone | Idea |
|---|---|---|
| 36 | Tabletop-art spike | One tower, one enemy and one patch of map in the stop-motion tabletop style, rendered off the Mac, for Kyle to judge before any full art pass |
| 37 | Themed HUD | Replace the placeholder bar and panels |

The game's theme is still loose (Kyle); milestones 31 to 34 do not depend
on it.

## Roles

Coordinator plans and writes no game code. Implementers: Claude Opus at
medium effort, or a cheaper model for mechanical work; Codex (rules in
`AGENTS.md`) while Kyle's Claude usage is short. Verifiers: Claude
Sonnet, always a different model from the implementer. Kyle plays and
approves.

## Later, not scheduled

A story mode (Kyle, third play notes). No new map types until later. Ideas
put to Kyle and not yet chosen: a second upgrade tier with a choice, stars per map and
difficulty, tower unlocks, a pause button and an enemy card.

## Out of scope for milestone 30

New towers, enemies or maps; a second upgrade tier; sound and new art;
saving a game in progress; any change to waves, call early or endless.
