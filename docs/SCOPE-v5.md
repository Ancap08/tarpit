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

## Milestone 41: a campaign of levels

Kyle (2026-11-23) wants, in time, "100's of levels with varying challenges
along the way so that it's new and hard along the way", different
challenges for different areas "with them all being available towards the
end", and one day a story mode. He agreed the order: levels as data and a
campaign first, so that many levels become possible. Nobody can balance
hundreds of levels by hand, so the structure comes with bots that prove
each level can be won. Built in two parts on one branch: 41a the rules,
levels and bots; 41b the screens.

### A level is data (41a)

- One small record per level: its name, its map, its waves, starting gold,
  how tough enemies are, which towers and specials the player
  may use, whether rewards are offered, one line describing its twist,
  and what it takes to earn two and three stars.
- A game can be started from a level. Everything a level does not change
  works as it does today. Today's game (pick a map and difficulty, 20
  waves, endless) stays exactly as it is and is called **Free play**.
- **Ten levels to start**, short (five to ten waves, about four to nine
  minutes), across the three maps. Each brings in one new thing, so the
  player meets the game a piece at a time:

| # | Map | New this level | Working name |
|---|---|---|---|
| 1 | Meadow | Musketeer and Longbow, Powder Keg | First Watch |
| 2 | Meadow | Cannon, against crowds | Pack Trail |
| 3 | Switchback | Tar Pit, against fast Wolves | The Switchback |
| 4 | Switchback | Fire Pot, tar and fire together, Shieldbearers | Burn Line |
| 5 | Riverbend | Harpies in the air, Tar Barrel | Wings Over the River |
| 6 | Riverbend | Mortar, against Trolls | Heavy Feet |
| 7 | Meadow | Barricade, against a horde | Hold the Bend |
| 8 | Switchback | Guards and Fire Arrows | Stand Fast |
| 9 | Riverbend | The second upgrade, and Grumblefoot | The Troll King |
| 10 | Meadow | Everything, and Grumblemaw | Last Light |

- **Stars:** every level starts with 20 lives; one star for winning, two
  for winning with at least 12 lives, three with at least 18. The same
  rule on every level (the first build had lives and thresholds per level;
  changed, see DECISIONS). Progress (stars, which levels are open) is
  kept in the browser like the best scores. Winning a level opens the
  next.
- **Bots prove every level.** A capable bot (places sensibly, upgrades,
  uses specials, limited to what the level allows) must win every level
  with at least two stars; a beginner bot (cheapest tower, first cells,
  no specials) must win the first three and must not three-star the later
  ones. A level that fails this cannot be added. This is the gate that
  later lets levels be generated instead of written.

### The screens (41b)

A first screen offering Campaign and Free play; a level map with ten
stops, stars and locks; a short card before a level (name, twist, what is
new); a result screen with stars and Next; both layouts and both looks.

### Not in this milestone

Generated levels, a story, new enemies or towers, the castle, longer
trails, more than ten levels.

## Milestone 42: first-visit tips, and a cheat that opens things

Kyle (2026-11-23, after playing levels 1 to 5): "How can we add
instructions before each round starts for the first time the user is
seeing that level?" and, on the gold cheat: "Yes we can add that to cheat,
can the cheat also unlock the locked weapons? If that's complicated then
we skip it, the cheat isn't important."

- **Tips.** Each level has up to three short lines that say how to use
  what the level brings in (level 1 covers the basics: place a tower,
  start a wave, use a special). The first time a player opens a level they
  are shown before it starts; after that the level card has a control to
  see them again. Which levels have been seen is kept in the browser.
  Words only, large, in `names.ts`. Free play has none.
- **Cheat.** A campaign win with the gold cheat opens the next level and
  still saves no stars; the result screen says so and offers Next level.
  In a campaign level the cheat also makes that run's locked towers,
  upgrades and specials usable. If that second part needs more than a
  small change to the rules, it is left out and reported. Bots and the
  gate never cheat.

Not in this milestone: pictures or animated tutorials, tips in Free play,
changes to any level.

## Milestone 43: the painted look on every map

Kyle (2026-11-23): "The one thing I've noticed is that I need to make a
more definitive theme and improve the images and graphics", wanted by the
next evening to show others. The painted look covers Meadow only, so a
campaign played in Painted falls back to Classic on seven of ten levels.
This part does not depend on the theme, which Kyle is still choosing.

- Painted ground, trail and scenery for Switchback and Riverbend (with its
  river), from the same Blender scripts and style as Meadow. Painted then
  works on all three maps, in Free play and the campaign, in both layouts.
- Fewer, packed files so the first painted load is quick on a phone
  (today 54 files, 10 to 14 s on mobile data).
- Classic stays the default until Kyle says otherwise.

Not in this milestone: new names, new characters, a themed HUD (the theme
pass, next).

## Milestone 44: a theme, "the King's collectors"

Kyle (2026-11-23) wants a definite theme and a better look to show people
the next evening: "a cross between medieval and colonial/1776 theme where
we keep characters like ... Axeman, Swordsman, Archer and special
character. And adding in a 'taxation is theft' vibe." He approved the
coordinator's table ("Yes, go"). The coordinator would not build a theme
from an existing franchise; these are original designs and common
archetypes only, and must not resemble any particular existing character.

**The world.** A frontier town in a fantasy 1776. King Grumblemaw sends
his collectors up the road to take the town's gold. The player keeps it.

| Id (unchanged) | Was | Becomes | Short form where space is tight |
|---|---|---|---|
| goblin | Goblin | Goblin Collector | Collector |
| wolf | Wolf | Revenue Hound | Hound |
| shieldbearer | Shieldbearer | Redcoat Shieldbearer | Redcoat |
| harpy | Harpy | Royal Harpy | Harpy |
| troll | Troll | Toll Troll | Toll Troll |
| boss | Grumblefoot | Assessor Grumblefoot | Grumblefoot |
| grumblemaw | Grumblemaw | King Grumblemaw | Grumblemaw |

Towers and specials keep their names. The four Guards are an Axeman, a
Swordsman, an Archer and a Captain; the special is still called Guards.
The game is still called Tarpit. Internal ids, rules and numbers do not
change.

Three parts:

- **44a, names and the default look.** The names above everywhere a
  player reads them (HUD, previews, cards, twist lines, tips, results,
  README), with short forms where the long ones do not fit; "Taxation is
  theft" and one line of story on the first screen; level names adjusted
  only where the theme makes one wrong; Painted becomes the default look
  for new players, with Classic one tap away and a stored choice
  respected (the coordinator's call for the showing; Kyle was asked and
  can reverse it).
- **44b, the characters re-dressed (Painted).** The five enemies and two
  bosses dressed for the theme, and four distinct Guards. Classic keeps
  its drawings and gets only the names.
- **44c, themed screens.** The first screen, level map, cards, result and
  HUD in the theme's look, replacing the placeholder panels (this is the
  "Themed HUD" long listed below).

Not in this milestone: new towers, enemies, rules or levels; a story
mode; Classic art changes; a new font file unless Kyle approves one.

## Milestone 45: a pause button

Kyle (2026-11-24, after playing the themed build on his phone): "I saw
that there is no pause button though."

- A Pause control in the HUD in both layouts, at least 44 px on the phone,
  and the P key. Pausing stops the game completely: enemies, towers,
  specials, timers, effects and sound.
- While paused a panel shows Resume, Restart, and Level map (campaign) or
  Menu (Free play), in the theme's kit. Nothing can be built, sold,
  upgraded or cast while paused (the coordinator's call: building is
  already untimed between waves, and the game is a little easy).
- The game pauses itself when the page is hidden or the phone locks, and
  stays paused until the player resumes.
- Pause does not change the rules: a paused and resumed game plays out
  exactly as an unpaused one.

Not in this milestone: saving a game across a reload, a settings screen.

## Direction after the theme (Kyle, 2026-11-24)

Kyle played the themed build on his phone ("it all works the way we wanted
it to"; "a good base, now I need to improve it visual and gameplay wise")
and agreed the coordinator's order: the town and story first; then level
variety and skill-based difficulty together; then talk through a hero the
player controls and the castle wall. He added: "I'd like to see what the
limits are on graphics ... how comically in-depth we could be with this,
like maybe just a level."

## Milestone 46: the town and its story

The player defends "lives" and one cottage. Make it a town people care
about, and tell the story in the game's own printed voice, without adding
taps for children to get through.

- **The town on the map.** At the exit, a small cluster (the cottage, the
  flag, a fence, a few townsfolk, one or two small buildings if the cells
  allow) drawn only on cells that are already unbuildable or as scenery
  that blocks nothing. The rules and the buildable grid do not change.
- **The town shows the stakes.** Four states tied to the star rule: 18 or
  more lives, untouched; 12 to 17, scuffed (a broken fence, a little
  smoke); 1 to 11, battered (more smoke, the flag at half height, people
  indoors); 0, taken (the King's banner up). Free play uses the same
  fractions of its starting lives. Each collector that gets through takes
  something visible: a sack of coin leaves the town.
- **Winning and losing look like it.** On a win the townsfolk come out and
  cheer; on a loss the collectors' banner goes up.
- **A picture of the town on the result screen** in the state the player
  left it, so the result is felt as well as counted.
- **The story, in notices.** The King posts a notice for each level and
  the town answers when it is won. No new screens in the normal flow: the
  King's notice is the heading text on the level card, the town's reply
  is one line on the win screen, the King gloats in one line on a loss.
  One short broadside the first time Campaign is opened, and one after
  level 10. Draft copy (the coordinator's; Kyle may change any line):

| Level | The King's notice | The town's reply |
|---|---|---|
| Opening | Hear ye. By order of King Grumblemaw, all gold in this town now belongs to the Crown. Collectors are on their way. | We counted it. It's ours. |
| 1 | A tax on doors. Collectors will call at yours. | We kept the doors. And the gold. |
| 2 | A tax on wheels, carts and anything that rolls. | Our cannonballs roll. Collect those. |
| 3 | A tax on running. The Hounds will show you how. | They ran. Slowly. Sorry about the tar. |
| 4 | A tax on firewood, payable to the Redcoats at once. | We burned it ourselves, thanks. |
| 5 | A tax on the sky. The Royal Harpies own it now. | The sky is still free. Mind the feathers. |
| 6 | A toll on this road: one Troll per traveller. | Toll paid. In mortar shells. |
| 7 | A tax on standing still. Move along, all of you. | We built a wall. It stood very still. |
| 8 | A tax on neighbours helping neighbours. | The neighbours say no. |
| 9 | The Assessor will now count your gold. Personally. | He lost count. |
| 10 | Enough. The King is coming for the lot. | (the ending) |
| Ending | | The King went home with empty pockets. The gold stayed where it was earned. Taxation is theft. |
| Any loss | The Crown thanks you for your contribution. | |

- Painted gets the art. Classic gets a plain version of the four states
  (smoke and the flag) and all of the words.

Not in this milestone: new rules, new levels, cut-scenes, voices, a
change to what a life is worth.

## Milestone 47: a showpiece level (a spike)

Kyle wants to see how far the graphics can be pushed, "comically
in-depth", on one level. This is a spike, like milestone 38's: it lives
behind a hidden switch (`?look=showpiece`, Meadow, level 1 and Free play
Meadow), changes nothing for anyone who does not use the switch, and its
purpose is to learn what is possible and what it costs on a phone.

- Everything is for the eye only. The rules, positions and timing do not
  change; nothing may misstate where an enemy is or whether it was hit;
  the fight must stay as readable as in Painted.
- Go far: a living place (wind, clouds, animals, people at their chores
  who run inside when the collectors come), a day that moves from morning
  to dusk across the waves, tower crews that load and fire, collectors
  who lose hats and spill coin, a field that keeps the marks of the
  battle, a camera that reacts, a victory worth watching, and whatever
  light and colour effects the browser allows.
- Measure it: frames a second on a phone-class device, memory, download
  size, and what each effect costs, with quality stepping down on its own
  when the device cannot keep up.
- Deliver a build Kyle can open on his phone, a short recording, and a
  table of what each idea cost and whether it is worth rolling into the
  whole game.

Not in this milestone: showpiece art for other maps, sound, any change to
Painted or Classic.

## Milestone 48: the King's new taxes (level variety and skill stars)

Kyle agreed (2026-11-24) to do these two together after the town and
story: "make levels different, not just harder" and "fix 'a little easy'
with skill, not bigger numbers". The idea that joins them to the theme:
**each new tax is a rule of the level.** The King's notice on the card is
no longer only a joke; it says what is different this time.

### Taxes (48a): a level may carry one or two

Each is a small field on the level record. Free play has none. Draft
names and numbers are the coordinator's; the numbers are for the gate and
the bots to settle, inside the stated ranges.

| Tax | What it does | Range to tune in |
|---|---|---|
| Window Tax | Each tower costs more than the one before it, by a fixed share of its base price | 5% to 10% a tower |
| Frozen Purse | Kills pay no gold; each wave cleared pays a lump sum | the lump is the level's to set |
| Forced March | Collectors move faster | 15% to 25% |
| Curfew | Towers reach less far | 10% to 20% |
| No Loitering | The next wave starts by itself a short time after the last one ends; it can still be called early | 8 to 15 seconds |
| Rationing | At most so many towers may stand at once (upgrades are free of the limit) | the limit is the level's to set |

A tax changes nothing else: the same towers, enemies, specials, 20 lives.
The HUD shows the taxes in force in a few words, and any number a tax
changes is shown changed where the player reads it (a tower's price, its
range ring, the countdown to the next wave, towers standing out of the
limit).

### Ten more levels (48b): the second act

Levels 11 to 20, across the three maps, five to ten waves each. Levels 11
to 16 bring in one tax each; 17 to 20 carry two together and no new rule.
The towers, specials and enemies are all available from level 11. Every
level passes the gate before it is added, and the gate learns to judge a
tax: it must bite (the level is measurably harder with it than without)
and stay fair (the person-like bot still wins with two stars).

### Skill stars (48b): the third star is a feat, on the new levels

Levels 1 to 10 keep the rule they have (a win; 12 lives; 18 lives), so no
saved star changes. On levels 11 to 20 the first two stars are the same
and the third is a named feat, earned together with two stars:

| Feat | Meaning |
|---|---|
| Not a penny | No collector gets through (all 20 lives) |
| Bare hands | Win without using a special |
| Few hands | Win with at most so many towers ever built (the number is the level's) |

The capable bot must be able to earn each level's feat; the beginner bot
must not. The card names the feat; the result says whether it was earned.

### Screens for twenty levels (48c)

The level map shows two acts (ten stops each) without scrolling inside an
act; the second opens when level 10 is won, with a short broadside ("The
King has thought of new taxes."). The level card shows the taxes in force
and the feat; the result shows the feat. The campaign's ending moves to
level 20; level 10 keeps its reply and closes the first act.

### Two known weak spots (48d, replaced by milestone 49)

Tar Barrel is weak and the Tar Pit's second upgrade path never beats the
first (recorded in DESIGN.md since milestone 37). Fix both with numbers,
re-lock the Free play balance report, and re-run the gate on all twenty
levels. Done last, on its own, because it moves the frozen balance.

Not in this milestone: new enemies, towers or maps; two entry points; a
hero; the castle wall; generated levels (the gate is being made ready for
them, not used for them yet).

## Milestone 49: tar and feathers

Kyle chose this on 2026-11-24 in place of the numbers-only fix planned as
48d. It makes tar the game's signature move and fixes the two known weak
spots (the Tar Barrel, and the Tar Pit's second path) in one change.

### The rule

- **Tarred** means an enemy is under a tar slow, from a Tar Pit shot or from
  standing in a Tar Barrel's tar.
- **Feathered:** a tarred enemy that is hit with feathers turns round and
  runs back along the road for a short, fixed time, then turns again and
  walks on. It keeps its feathers for the rest of its life and cannot be
  feathered twice.
- **Flinch:** an enemy that a running, feathered enemy passes stops for a
  moment. Once per enemy.
- **Bosses** (Assessor Grumblefoot, King Grumblemaw) are too proud to run:
  they are never feathered and never flinch.
- Everything is deterministic: fixed ticks, no randomness.

### Where feathers come from

| Source | Today | After |
|---|---|---|
| Tar Pit, path B | Wide Tar: a weaker slow from farther away | **Feathers**: a shot tars an untarred enemy and feathers a tarred one. It aims at enemies without feathers first |
| Tar Barrel (special) | Slows a crowd and leaves tar | **Unchanged.** Enemies in its tar are tarred, so a Feathers tower feathers them with its first shot. That is the combination |

Path A (Deep Tar) and the other specials keep their rules. Numbers are the
implementer's to tune inside the targets below.

### Words (coordinator)

| Where | Text |
|---|---|
| Tar Pit path B, name | Feathers |
| Tar Pit path B, line | Tarred enemies run back. (First written as "Feathers tarred enemies. They run back.", which overlapped the card title on Linux with wider text.) |
| One new tip line on the first level that offers path B and has a boss (level 9) | Feathers make tarred enemies run back. Bosses are too proud. (If it does not fit: "Feathers make tarred enemies run. Bosses are too proud.") |

Tone is comic: a puff of feathers, an enemy running the wrong way. Nothing
is hurt by feathers.

### Targets (each must be a test that can fail)

| Label | Target |
|---|---|
| R1 | Tar Pit path B beats path A on at least one Free play map and A beats B on at least one, by the existing path-balance measure; the gap between them is 9 lives or fewer. The recorded exception for the Tar Pit is removed |
| R3 | An enemy is feathered at most once, a boss never; no run of the simulation has an enemy leave by the entrance or wait there for ever |
| R4 | Every Free play balance target passes with its target windows unchanged; the report is re-locked |
| R5 | The campaign gate passes on all twenty levels with level data unchanged, including the feat rules |
| R6 | A bot that leans on feathers (Tar Pits on path B, and the barrel where allowed) does not beat the good bot by more than 3 lives on any campaign level, and wins no third star the good bot does not |
| R7 | Any run with no path B Tar Pit is byte for byte what it was before |
| R8 | It can be seen: a feathered enemy runs back for at least 60 ticks (one second) at no less than its own walking speed |

**Second change, after the first build.** With the barrel feathering whole
crowds, only 8 of 20 levels still passed the campaign gate and Free play's
shape targets failed, and the only numbers that came close shrank the run to
10 px, which nobody would see. So the barrel is left exactly as it is and
feathers come from the Tar Pit's second path alone. The gate's three bots
never buy that path, so their runs do not move. The barrel targets (R2a to
R2c) are dropped: measured, the barrel is already worth casting (4, 3 and 4
lives better than leaving its turn unused); it only loses to Fire Arrows.
A barrel that feathers a whole crowd needs the levels retuned, which is
Kyle's call and a later milestone.

R2 was first written as "the barrel policy matches the policy that skips
it on every map". That cannot be met: skipping the barrel gives Fire Arrows
every turn, which ends on 17 and 20 lives on Meadow and Riverbend, above the
Free play ceiling of 15 that the standard policy must stay under. Fire
Arrows every turn stays the stronger lives policy on those two maps; evening
that out needs a Fire Arrows change, which is not in this milestone.

If R4, R5 or R6 cannot be met by tuning tar and feather numbers alone, the
implementer stops and reports; level data and target windows are not moved
to make this pass.

### Look and sound

A feathered enemy shows it in all three looks (Classic, Painted, and the
showpiece switch): feathers on the body, a puff when it happens, and the
sprite facing the way it runs. A flinch is visible. All motion is on the
pausable clock. One short synthesized sound for the puff if the sound code
makes its sounds in code; no audio files.

### Not in this milestone

New towers, enemies, maps or levels; a new special; a hero; the castle
wall; the Daily Writ; turncoats; gold-stealing collectors; a level editor.

## Milestone 50: the town's answer (feather barrels in Act Two)

Kyle chose a crowd-feathering Tar Barrel on 2026-11-24 ("Yes, retune
levels") and, after two builds showed it could not fit Free play without
rebalancing Free play, chose to keep it to Act Two: "We'll keep it act two
for now, if we decide that it should be done later then we can group it in
with other items at that time."

### The rule

- On levels 11 to 20 the town has **feather barrels**: a Tar Barrel tars and
  feathers every enemy it lands on that can be feathered, so a whole crowd
  runs back. It still leaves its tar.
- It is a rule of the level, held in level data the way taxes are, and the
  level card says so. The King has his taxes; this is the town's answer.
- A feather barrel costs more: the shared special charge takes longer to
  come back after one, and the run it causes may be shorter than a Feathers
  tower's (never under the 60-tick floor). The button shows the real wait.
- Everything else from milestone 49 holds: once per enemy, bosses never
  run, flinch, a Feathers tower feathers enemies standing in tar.
- **Levels 1 to 10 and Free play do not change at all.** There the Tar
  Barrel is exactly what it is today, with today's wait.

### Words (coordinator)

| Where | Text |
|---|---|
| Level card, levels with feather barrels, in the town's blue | Town's answer: Tar Barrels feather crowds. |
| Tar Barrel's line on those levels | Feathers a crowd. Next special in 51s. (The number is built from the wait in the data. First written as "Tar and feathers. Enemies caught run back.", which hid the cost.) |
| Second tip line on the first Act Two level that allows the barrel | After a feather barrel, specials take 51s to return. (Number from the data.) |
| Tip on the first Act Two level that allows the barrel | Drop a Tar Barrel on a crowd and they run back. |
| Tar Barrel's line and the level 5 tip everywhere else | Unchanged |

### What may move

1. The feather barrel's own cost: the wait after it (today's refill up to
   three times as long) and its run length (60 to 88 ticks).
2. Levels 11 to 20: starting gold, health scale and health growth within
   15% of today, then wave contents if needed.

Not to move: anything on levels 1 to 10 (including the 0.987 health scale
tried on level 9, which goes back to 1), Free play in any form, both Tar
Pit paths, the Feathers tower's run and flinch, every other tower, enemy
and special, the rules of taxes and feats, star lines, the 20 lives.

### Targets (each a test that can fail)

| Label | Target |
|---|---|
| C1 | On a feather-barrel level one cast feathers every enemy in its radius that is not a boss and not already feathered; none twice. On any other level and in Free play a cast feathers nothing |
| C2 | Worth casting: on each of levels 11 to 20 that allows the barrel, the good bot ends at least 1 life or a star better than the same play with the barrel's turns unused, or already ends on 20 lives. (First written as 2 lives. Lowered once, by the coordinator: four of the levels that gained 1 give their third star for using no specials, so a barrel worth a little there is right. A barrel worth nothing, as on level 20, still fails.) |
| C4 | Free play is untouched: every Free play output and the locked report are byte for byte as on main |
| C5 | The campaign gate passes on all twenty levels, every label |
| C6 | Fair for a person: the good and person-like bots with every Tar Pit on Feathers and the barrel preferred end no more than 4 lives above the unmodified good bot on any level and win no third star it does not |
| C7 | Levels 1 to 10 are byte for byte as on main for every bot. Every changed number on levels 11 to 20 is listed old and new |
| C8 | The finale holds: on level 20 the good bot ends within 2 lives of today |
| C9 | The wait after a feather barrel is longer than after any other special, the button shows it, and an ordinary Tar Barrel on levels 1 to 10 and in Free play keeps today's wait |
| C10 | The card says it: every level with feather barrels shows the town's answer line, no other level does, and it fits at 390x664 and 390x844 with one and two taxes, in the fixed-metrics and wide-text modes |

If these cannot all be met, the implementer stops and reports.

### What the first two builds found (kept for the record)

At full strength and today's wait the crowd barrel lifted Free play's
standard run from 14, 11 and 14 lives to 21, 15 and 22. With a 50-second
wait and a 63-tick run the campaign could pass on all twenty levels by
moving ten levels' numbers, with level 10 three lives harder. Free play
could not: the best trial moved Hard's health by 16% and 51% and still
missed 7 of 91 targets.

### Later, if Kyle wants it

Feather barrels everywhere, which needs a Free play rebalance. Kyle: group
it with other items at that time if it makes sense.

### Not in this milestone

A Fire Arrows change; new towers, enemies, maps or levels; the hero; the
castle wall; the Daily Writ; turncoats; gold-stealing collectors; a level
editor.

## Act Three: the Siege (direction, Kyle, 2026-11-24)

Kyle agreed a third act of new levels in which the town holds an old
fortress: a castle wall as the last defence, then a hero the player moves.
Acts One and Two and Free play stay as they are. His words on the look:
"The look should be the opposite of modest, I would like for this to be a
grand, in depth, high quality aspect of the game. It will be out of place,
and ... if I have to concede quality for this aspect then that's ok". He
showed two reference images for the general idea only: a towering gothic
castle, spires on spires, a storm sky, lit windows.

Agreed in outline:

- **The wall:** a gate at the town end with health; enemies stop and hit
  it; gold repairs it between waves; when it falls every tower fires faster
  for a short time, once, and after that leaks cost lives as today.
- **The hero:** the Captain. Tap him, tap the road; he walks there, blocks
  and fights, and returns after a wait if he falls. One ability on a timer.
  No levelling or gear at first; built so other heroes can follow.
- **Behind the wall:** Kyle's larger idea is "almost another game, where
  you defend from behind the wall, and use weapons that stay behind the
  wall and come out in front of the wall". Act Three carries as much of
  that as the present rules allow (tower spots on the battlements, the
  Captain and Guards coming out of the gate, roads meeting at the gate) and
  is the prototype for it. **A full wall-defence mode is the candidate for
  version 2,** not built here.
- **Order:** the castle's look first, then the wall rule and the first
  siege levels, then the Captain.

Coordinator's assumptions, Kyle told and free to change: the fortress is
the town's refuge, not the King's castle; the tone stays right for
children (storm and drama, no horror).

## Milestone 51: the Old Keep (a look spike)

One Act Three map with the full castle, for Kyle to judge on his phone
before any rule depends on it. Art is the largest risk in Act Three and the
part Kyle cares most about.

### What is built

- A new map, **the Old Keep**, reached only by a hidden switch
  (`?keep=1`, straight into the level). It is not on the level map, not in
  Free play, saves no stars or progress, and is outside every balance and
  gate measure.
- It plays with today's rules: a road climbing to the gate, a short fixed
  list of waves from existing enemies, existing towers on marked spots
  (some on the wall-walk, as a hint of what comes), 20 lives. No wall
  health, no hero, no new rule of any kind.
- **The castle is the point.** Our own design from the mood Kyle showed,
  not a copy of any existing castle, game or picture: a gothic keep with
  many spires at different depths, buttresses, tall lit windows, a
  gatehouse with a portcullis, a curtain wall with battlements, stairs or
  a bridge to the gate. Made by Blender scripts in `scripts/art/`, like the
  rest of the painted art.
- **Depth and motion:** layers that shift against each other as the view
  moves; a dusk storm sky with drifting cloud; lightning that lights the
  castle for a moment; windows and torches that flicker; banners that
  move; fog low on the road; embers or rain. A slow drift of the view at
  the start, from the spires down to the road.
- **Portrait first.** At 390x844 the castle fills the top of the screen
  and the road climbs to it. On tablet and desktop it must also compose
  well; the phone decides.

### Limits

- With the switch off, nothing changes: no pixel, no request, no byte of
  any sim output. The keep's art loads only when the switch is on.
- The keep's art is at most 8 MB; the built site stays under its 20 MB
  budget.
- It holds the frame rate: the showpiece's quality governor (or the same
  idea) drops effects before frames. Numbers reported at phone size with
  `?perf=1`, with 40 enemies on the road.
- All motion on the pausable clock; frozen and silent under `?test=1`.
- Only own-script art, listed in `assets/MANIFEST.md`. No downloaded or
  generated images.
- Tone: grand and stormy. No skulls, gore or horror.

### Evidence

Stills at 390x844, 390x664, tablet and desktop, with the road and HUD in
frame; close-ups of the keep; a lightning frame; and a screen recording of
about 15 seconds on the phone size. A table of what the governor drops
and the frame times.

### Not in this milestone

The wall rule, repair, the last stand, converging roads, the Captain, Act
Three levels on the level map, story text, sound, any change to Acts One
and Two or Free play.

## Milestone 52: the wall (Act Three, the first siege levels)

Approved by Kyle on 2026-11-25 ("Approve, start"). The castle of milestone 51 becomes a place the player defends.
Built in three parts, each checked before the next, by `gpt-6.2-sol` while
Astra is paused.

### The rules

- **The gate.** Near the end of the road stands the castle gate, with
  health set by the level. Behind it is **the yard**: a last stretch of
  road, set by the level, up to the keep's door, where the road ends. (Added
  after part a: with the gate at the very end, everything held at it leaked
  on the tick after it fell, and the last stand could save nothing.) Ground enemies that reach it stop and hit it, using the
  rule the Barricade already has. While it stands they cost no lives.
- **Flyers go over.** Royal Harpies ignore the gate and cost lives as they
  do today, so the sky still has to be defended.
- **Repair.** Between waves the player may spend gold to mend the gate, in
  steps, up to full. Not during a wave. A last step smaller than a full
  one costs in proportion, and the control shows the price the player will
  pay.
- **The last stand.** When the gate falls, once in the level, every tower
  fires faster for a short time, while the enemies that were held cross the
  yard. Any that reach the keep's door cost lives as today. A fallen gate cannot be rebuilt in that level.
- **High ground.** Tower spots on the wall-walk give a little more range.
  That is the first piece of "weapons behind the wall".
- **Roads that meet at the gate.** A map may have more than one entrance;
  each group in a wave names its road. New rule work: today every map has
  one road.
- **Stars.** One for winning, two for 12 lives or more, as now. The third
  star in Act Three is a feat: **Unbroken** (win with the gate standing) on
  some levels, **Not a nail** (win without repairing) on others, so that
  repair is not always the answer.

Added on 2026-11-25 from an outside creative review (Claude Opus) that Kyle
asked for; he took the coordinator's recommended set ("Yes get started on
those you recommended"):

- **Pillow windows.** On levels that have them, the keep's lit windows are
  the townsfolk's bedrooms. Tap a window during a wave and a feather pillow
  is shaken out, after a pot of tar: every enemy on the stretch of road
  below it is tarred and feathered, by the usual rule (once per enemy,
  never a boss), as a feather barrel does. Each window works once in the
  level and then goes dark. (First written as "every tarred enemy"; two
  windows then feathered seven enemies and changed no score.)
- **The Final Notice.** One new enemy: a battering ram in the shape of a
  giant rolled tax notice. Slow, and it does heavy damage to the gate and
  little else. It can be tarred and feathered like any walker, and when
  feathered it rolls back down the road.
- **Two siege taxes,** in the King's voice, at most one on a level:
  **Quartering** (a Redcoat is billeted on one wall spot, which cannot be
  built on until the player pays him off) and **Royal Survey** (the wall
  spots named on the card, one or more, are closed for the whole level;
  first written as one spot, which the good bot simply built around).
- **Which road.** Before each wave the player is shown which road each
  group will take.

### The levels

Five levels, 21 to 25, all at the Old Keep, opened by winning level 20.
Feather barrels carry over from Act Two. The `?keep=1` switch is removed
once level 21 exists. One new thing a level, so nobody has to learn it all
at once:

| Level | Name | New here | Roads | Sky | Third star |
|---|---|---|---|---|---|
| 21 | Rent Overdue | The gate, repair, the last stand, high ground | East | Dusk | Unbroken |
| 22 | Feather Beds | Pillow windows | West | Dusk | Not a nail |
| 23 | Both Roads | Two roads, and the Royal Survey | Both | Night storm | Unbroken |
| 24 | Quartering | Quartering | Both | Night storm | Not a nail |
| 25 | The Final Notice | The ram, then King Grumblemaw | Both | Dawn | Unbroken |

### Words (coordinator)

The King's notice on each card, and the town's reply on a win:

| Level | The King's notice | The town's reply |
|---|---|---|
| 21 | You hide in my grandfather's keep. The rent is overdue. So is the tax on the rent. | We never signed the lease. |
| 22 | I hear you sleep soundly in there. Sleep is now taxed, by the hour. | No vote, no tax. Have some feathers. |
| 23 | Who built those roads? I did, with your gold. My surveyor has condemned your wall. | We paid for the roads. Walk home on them. |
| 24 | A soldier of mine will lodge on your wall. Feed him, and thank me for it. | No quarter without consent. He bunks with the Trolls. |
| 25 | Final notice. Pay what you owe for the privilege of being ruled. | Taxation is theft. Returned to sender. |

Voice, from Kyle (2026-11-25): angrier at the government, "think Boston tea
party stuff", leaning into "taxation is theft" with a libertarian, agorist
vibe. Kept comic and clean for children: the King is pompous and grasping,
the town is dry and unbowed; consent, votes, who paid for the roads, no
quartering. No real people, parties or flags. The first versions of these
lines (milder) are in the git history.

Rule lines on the card ("In force", built from level data where they hold
a number): `Royal Survey: N wall spots are closed.` (N from level data; `one wall spot is` when N is 1) and
`Quartering: a Redcoat holds a wall spot until paid NN gold.` The town's
line where windows exist: `Town's answer: tap a lit window for feathers.`
Feat lines: `Third star, Unbroken: win with the gate standing.` and
`Third star, Not a nail: win without a repair.` The ram's name in previews
is `Ram`; its full name is `The Final Notice`. Tips for each new thing, at
most three a level and 61 characters each, are the implementer's to draft
in this voice and the coordinator's to approve.

### The parts

| Part | What | Checked by |
|---|---|---|
| 52a | The gate, the yard, repair, the last stand and high ground, on one road, with bots that can repair. Sim and a plain HUD only. **Done** | Sonnet, then CI |
| 52b1 | New rules, each with tests and a plain control: roads that meet; pillow windows; the ram; Quartering and Royal Survey; Not a nail; which road each group takes, as data | CI of its own tests; verified with b2 |
| 52b2 | Levels 21 to 25 as data, with the words above, tuned against the targets; the level gate extended to Act Three; bots that use windows and pay off the Redcoat | Sonnet, then CI |
| 52c1 | Screens: a third sheet on the level map, level cards, the act's broadside, road banners before a wave, the gate HUD in its final form, and the view settling lower when a wave starts so the road has the screen | verified with c2 |
| 52c2 | Art and sound: the gate's damage shown on the gate itself; enemies drawn larger at the gate and in the yard; pillow windows; the ram; the billeted Redcoat; mortar shells on keep levels drawn as rolled notices; the ending in which King Grumblemaw's carriage is tarred and feathered; a siege drum that quickens as the gate weakens, a creak and a bell, made in code; and the castle's open look items (a starker lightning frame, richer ground, the desktop and tablet composition, the painted gatehouse lined up with the gate's place in the rules) | Sonnet, then CI, then Kyle's phone |

### Targets (each a test that can fail; numbers are the implementer's)

| Label | Target |
|---|---|
| W1 | The gate matters: with the gate's health halved the good bot ends at least 2 lives or a star worse on every Act Three level |
| W2 | Repair matters: the good bot with repair forbidden ends worse on at least three of the five levels, and repair is never so cheap that the gate cannot fall |
| W3 | The last stand is a rescue, not a plan: the good bot wins every level without the gate falling; the person-like bot loses the gate on at least two levels and still wins them |
| W4 | The sky matters: on every level with Harpies, a build with no tower that can hit flyers loses lives while the gate stands |
| W5 | Unbroken is earned: the good bot earns it on every level when it plays for it; the person-like bot earns it on at most two |
| W6 | Each road matters: on a two-road level, leaving either road undefended loses the gate |
| W7 | Act Three is a step up: the person-like bot's mean lives fall at least 1.5 from Act Two's |
| W8 | Nothing else moves: levels 1 to 20 and Free play are byte for byte as before for every bot; Act Two's difficulty step is unchanged |
| W9 | The existing level rules (two-star lines, margins under nudges, variety, fairness for a feathers-leaning player) hold on levels 21 to 25 |
| W10 | Windows help and are not needed: on level 22 the good bot ends at least 2 lives or a star better using them than not, and still wins without them |
| W11 | The ram is a gate problem: on level 25, ignored, it breaks the gate; tarred and feathered in time, it does not |
| W12 | Each siege tax bites and can be lived with: on its level the good bot ends worse with the tax than without, and still earns two stars |
| W13 | Not a nail is earned: the good bot earns it when it plays for it, the person-like bot on at most one of its two levels, and repairing forfeits it |
| W14 | One new thing a level: no level introduces more than the table above says |

### Not in this milestone

The Captain; opening and closing the gate to send troops out (the outside
review argued for building that before the Captain; Kyle has not decided);
a full wall-defence mode (version 2); walls or gates in Acts One and Two or
Free play; new towers; any new enemy other than the ram.

### From the review, kept for later (not scheduled)

Saved runs that replay exactly, as one foundation for tuning stars on real
children's play, a Play the King mode, the test bots as rivals on the level
card, a retry of the last wave, and the Daily Writ; a bait purse special;
naming your town; lightning on a posted timetable; a level where lives are
gold; the repair price shown in tower terms. Kyle is rereading the full
list and may add from it.

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
