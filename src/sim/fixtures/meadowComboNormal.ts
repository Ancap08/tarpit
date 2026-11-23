// Meadow's Normal combo at the campaign win, including the last wave's events.
// The maps test compares the complete plain state except for the map definition.
import type { GameState } from '../types';

export const MEADOW_COMBO_NORMAL: Omit<GameState, 'map'> = {
  "difficulty": "normal",
  "endless": false,
  "boons": [
    "longBarrels",
    "stickyTar",
    "stoneWalls"
  ],
  "pendingBoon": null,
  "packs": [],
  "phase": "won",
  "gold": 250,
  "lives": 14,
  "wave": 20,
  "specialCharges": 0,
  "specialRechargeTicks": 0,
  "zones": [],
  "blocker": null,
  "nextZoneId": 39,
  "cheated": false,
  "tick": 78990,
  "waveTick": 5236,
  "spawnedPerGroup": [
    8,
    5,
    8,
    6,
    1
  ],
  "enemies": [],
  "nextEnemyId": 1174,
  "towers": [
    {
      "cell": {
        "col": 7,
        "row": 1
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 2,
      "path": "A"
    },
    {
      "cell": {
        "col": 10,
        "row": 1
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 1,
      "path": "A"
    },
    {
      "cell": {
        "col": 3,
        "row": 3
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 6,
      "path": "A"
    },
    {
      "cell": {
        "col": 14,
        "row": 3
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 0,
      "path": "A"
    },
    {
      "cell": {
        "col": 9,
        "row": 4
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 162,
      "path": "A"
    },
    {
      "cell": {
        "col": 10,
        "row": 4
      },
      "type": "firepot",
      "upgraded": false,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 5
    },
    {
      "cell": {
        "col": 11,
        "row": 4
      },
      "type": "tarpit",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 220,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 3,
      "path": "A"
    },
    {
      "cell": {
        "col": 2,
        "row": 5
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 10,
      "path": "A"
    },
    {
      "cell": {
        "col": 9,
        "row": 5
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 159,
      "path": "A"
    },
    {
      "cell": {
        "col": 6,
        "row": 6
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 6,
      "path": "A"
    },
    {
      "cell": {
        "col": 9,
        "row": 6
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 4,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 69,
      "path": "A"
    },
    {
      "cell": {
        "col": 15,
        "row": 6
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 6,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 60,
      "path": "A"
    },
    {
      "cell": {
        "col": 17,
        "row": 6
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 25,
      "spent": 380,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 152,
      "path": "A"
    },
    {
      "cell": {
        "col": 9,
        "row": 7
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 180,
      "spent": 380,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 181,
      "path": "A"
    },
    {
      "cell": {
        "col": 16,
        "row": 7
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 108,
      "spent": 380,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 46,
      "path": "A"
    },
    {
      "cell": {
        "col": 16,
        "row": 8
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 21,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 22,
      "path": "A"
    },
    {
      "cell": {
        "col": 25,
        "row": 8
      },
      "type": "musketeer",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 170,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 3,
      "path": "A"
    },
    {
      "cell": {
        "col": 14,
        "row": 9
      },
      "type": "firepot",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 3,
      "spent": 240,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 9,
      "path": "B"
    },
    {
      "cell": {
        "col": 16,
        "row": 9
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 1,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 13,
      "path": "A"
    },
    {
      "cell": {
        "col": 17,
        "row": 9
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 22,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 10,
      "path": "A"
    },
    {
      "cell": {
        "col": 14,
        "row": 10
      },
      "type": "tarpit",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 15,
      "spent": 220,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 1,
      "path": "A"
    },
    {
      "cell": {
        "col": 15,
        "row": 10
      },
      "type": "cannon",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 54,
      "spent": 280,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 31,
      "path": "B"
    },
    {
      "cell": {
        "col": 17,
        "row": 10
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 2,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 7,
      "path": "A"
    }
  ],
  "shots": [
    {
      "cell": {
        "col": 9,
        "row": 7
      },
      "tower": "mortar",
      "targetId": 1157,
      "from": {
        "x": 304,
        "y": 240
      },
      "to": {
        "x": 420,
        "y": 321.59999999995705
      },
      "splashRadius": 70
    }
  ],
  "events": [
    {
      "kind": "burn",
      "enemyId": 1157,
      "damage": 0.26666666666666666
    },
    {
      "kind": "hit",
      "enemyId": 1157,
      "cell": {
        "col": 9,
        "row": 7
      },
      "tower": "mortar",
      "damage": 140
    },
    {
      "kind": "kill",
      "enemyId": 1157,
      "enemyType": "grumblemaw",
      "bounty": 75,
      "cause": "shot"
    },
    {
      "kind": "bossDown",
      "enemyId": 1157,
      "enemyType": "grumblemaw",
      "cause": "shot"
    },
    {
      "kind": "waveClear",
      "wave": 20,
      "bonus": 25
    },
    {
      "kind": "won"
    }
  ]
};
