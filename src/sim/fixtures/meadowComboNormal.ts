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
  "gold": 280,
  "lives": 10,
  "wave": 20,
  "specialCharges": 0,
  "specialRechargeTicks": 0,
  "zones": [],
  "nextZoneId": 41,
  "cheated": false,
  "tick": 76937,
  "waveTick": 4854,
  "spawnedPerGroup": [
    8,
    5,
    8,
    6,
    1
  ],
  "enemies": [],
  "nextEnemyId": 1207,
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
      "kills": 0,
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
      "kills": 19,
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
      "cooldownTicks": 10,
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
      "cooldownTicks": 10,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 146,
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
      "kills": 8
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
      "kills": 2,
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
      "kills": 46,
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
      "cooldownTicks": 19,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 176,
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
      "kills": 29,
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
      "cooldownTicks": 17,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 70,
      "path": "A"
    },
    {
      "cell": {
        "col": 14,
        "row": 6
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 24,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 0
    },
    {
      "cell": {
        "col": 15,
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
      "kills": 55,
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
      "cooldownTicks": 47,
      "spent": 380,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 131,
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
      "cooldownTicks": 22,
      "spent": 380,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 188,
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
      "cooldownTicks": 130,
      "spent": 380,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 40,
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
      "cooldownTicks": 19,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 13,
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
      "kills": 2,
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
      "cooldownTicks": 25,
      "spent": 240,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 11,
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
      "cooldownTicks": 23,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 11,
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
      "cooldownTicks": 20,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 8,
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
      "cooldownTicks": 7,
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
      "cooldownTicks": 16,
      "spent": 280,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 11,
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
      "cooldownTicks": 24,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 14,
      "path": "A"
    }
  ],
  "shots": [
    {
      "cell": {
        "col": 14,
        "row": 6
      },
      "tower": "longbow",
      "targetId": 1190,
      "from": {
        "x": 464,
        "y": 208
      },
      "to": {
        "x": 420,
        "y": 259.20666666663703
      }
    },
    {
      "cell": {
        "col": 17,
        "row": 10
      },
      "tower": "longbow",
      "targetId": 1190,
      "from": {
        "x": 560,
        "y": 336
      },
      "to": {
        "x": 420,
        "y": 259.20666666663703
      }
    }
  ],
  "events": [
    {
      "kind": "burn",
      "enemyId": 1190,
      "damage": 0.26666666666666666
    },
    {
      "kind": "hit",
      "enemyId": 1190,
      "cell": {
        "col": 14,
        "row": 6
      },
      "tower": "longbow",
      "damage": 9
    },
    {
      "kind": "hit",
      "enemyId": 1190,
      "cell": {
        "col": 17,
        "row": 10
      },
      "tower": "longbow",
      "damage": 16
    },
    {
      "kind": "kill",
      "enemyId": 1190,
      "enemyType": "grumblemaw",
      "bounty": 75,
      "cause": "shot"
    },
    {
      "kind": "bossDown",
      "enemyId": 1190,
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
