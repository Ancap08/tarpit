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
  "gold": 2847,
  "lives": 19,
  "wave": 20,
  "specialCharges": 0,
  "specialRechargeTicks": 0,
  "zones": [],
  "nextZoneId": 40,
  "cheated": false,
  "tick": 78699,
  "waveTick": 5736,
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
      "kills": 118
    },
    {
      "cell": {
        "col": 10,
        "row": 4
      },
      "type": "firepot",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 120,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 7
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
      "kills": 1
    },
    {
      "cell": {
        "col": 8,
        "row": 5
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 28
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
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 166
    },
    {
      "cell": {
        "col": 8,
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
      "kills": 81
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
      "kills": 97
    },
    {
      "cell": {
        "col": 17,
        "row": 6
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 70,
      "spent": 190,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 139
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
      "kills": 233
    },
    {
      "cell": {
        "col": 16,
        "row": 7
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 1,
      "spent": 190,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 26
    },
    {
      "cell": {
        "col": 16,
        "row": 8
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 6
    },
    {
      "cell": {
        "col": 17,
        "row": 8
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 21
    },
    {
      "cell": {
        "col": 23,
        "row": 8
      },
      "type": "cannon",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 120,
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 1
    },
    {
      "cell": {
        "col": 25,
        "row": 8
      },
      "type": "musketeer",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 48,
      "spent": 85,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 0
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
      "spent": 120,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 16
    },
    {
      "cell": {
        "col": 16,
        "row": 9
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 3
    },
    {
      "cell": {
        "col": 17,
        "row": 9
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 7
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
      "spent": 110,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 10
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
      "spent": 140,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 0
    },
    {
      "cell": {
        "col": 17,
        "row": 10
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
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
        "col": 23,
        "row": 8
      },
      "tower": "cannon",
      "targetId": 1208,
      "from": {
        "x": 752,
        "y": 272
      },
      "to": {
        "x": 832.2916666665817,
        "y": 192
      },
      "splashRadius": 55
    }
  ],
  "events": [
    {
      "kind": "hit",
      "enemyId": 1208,
      "cell": {
        "col": 23,
        "row": 8
      },
      "tower": "cannon",
      "damage": 40
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
