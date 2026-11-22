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

## Later milestones (order agreed, detail to come)

| # | Milestone | Idea |
|---|---|---|
| 34 | A living map | Moving water, chimney smoke, trees, varied grass: rich to look at, simple to build |
| 35 | Towers with personality | Upgrades that change the look |
| 36 | Tabletop-art spike | One tower, one enemy and one patch of map in the stop-motion tabletop style, rendered off the Mac, for Kyle to judge before any full art pass |
| 37 | Themed HUD | Replace the placeholder bar and panels |

The game's theme is still loose (Kyle); milestones 31 to 34 do not depend
on it.

## Roles

Coordinator plans and writes no game code. Implementers: Claude Opus at
medium effort, or a cheaper model for mechanical work. Verifiers: Claude
Sonnet, always a different model from the implementer. Kyle plays and
approves.

## Later, not scheduled

A story mode (Kyle, third play notes). No new map types until later. Ideas
put to Kyle and not yet chosen: a second upgrade tier with a choice, stars per map and
difficulty, tower unlocks, a pause button and an enemy card.

## Out of scope for milestone 30

New towers, enemies or maps; a second upgrade tier; sound and new art;
saving a game in progress; any change to waves, call early or endless.
