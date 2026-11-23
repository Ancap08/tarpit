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
  "gold": 2451,
  "lives": 17,
  "wave": 20,
  "specialCharges": 0,
  "specialRechargeTicks": 0,
  "zones": [],
  "nextZoneId": 41,
  "cheated": false,
  "tick": 78416,
  "waveTick": 5337,
  "spawnedPerGroup": [
    20,
    15,
    18,
    12,
    1
  ],
  "enemies": [],
  "nextEnemyId": 1225,
  "towers": [
    {
      "cell": {
        "col": 9,
        "row": 4
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 151
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
      "kills": 14
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
      "spent": 110,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 7
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
      "kills": 206,
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
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 100
    },
    {
      "cell": {
        "col": 15,
        "row": 6
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 52
    },
    {
      "cell": {
        "col": 17,
        "row": 6
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 109,
      "spent": 380,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 132,
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
      "cooldownTicks": 0,
      "spent": 190,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 257
    },
    {
      "cell": {
        "col": 16,
        "row": 7
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 118,
      "spent": 190,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 33
    },
    {
      "cell": {
        "col": 16,
        "row": 8
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 24,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 6
    },
    {
      "cell": {
        "col": 25,
        "row": 8
      },
      "type": "musketeer",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 14,
      "spent": 170,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 0,
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
      "cooldownTicks": 0,
      "spent": 240,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 6,
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
      "cooldownTicks": 21,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 6
    },
    {
      "cell": {
        "col": 17,
        "row": 9
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 2,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 4
    },
    {
      "cell": {
        "col": 14,
        "row": 10
      },
      "type": "tarpit",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
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
      "cooldownTicks": 0,
      "spent": 280,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 1,
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
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 4
    }
  ],
  "shots": [
    {
      "cell": {
        "col": 16,
        "row": 8
      },
      "tower": "longbow",
      "targetId": 1208,
      "from": {
        "x": 528,
        "y": 272
      },
      "to": {
        "x": 680,
        "y": 241.11333333326002
      }
    }
  ],
  "events": [
    {
      "kind": "hit",
      "enemyId": 1208,
      "cell": {
        "col": 16,
        "row": 8
      },
      "tower": "longbow",
      "damage": 9
    },
    {
      "kind": "kill",
      "enemyId": 1208,
      "enemyType": "grumblemaw",
      "bounty": 300,
      "cause": "shot"
    },
    {
      "kind": "bossDown",
      "enemyId": 1208,
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
