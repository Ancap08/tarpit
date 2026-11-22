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
  "gold": 3196,
  "lives": 17,
  "wave": 20,
  "specialCharges": 0,
  "specialRechargeTicks": 0,
  "zones": [],
  "nextZoneId": 47,
  "cheated": false,
  "tick": 91579,
  "waveTick": 9762,
  "spawnedPerGroup": [
    38,
    22,
    16,
    26,
    1
  ],
  "enemies": [],
  "nextEnemyId": 1421,
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
      "kills": 129
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
      "kills": 17
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
      "kills": 9
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
      "kills": 50
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
      "kills": 191
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
      "kills": 100
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
      "kills": 111
    },
    {
      "cell": {
        "col": 17,
        "row": 6
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
      "spent": 190,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 121
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
      "kills": 283
    },
    {
      "cell": {
        "col": 16,
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
      "kills": 48
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
      "kills": 5
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
      "kills": 26
    },
    {
      "cell": {
        "col": 23,
        "row": 8
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
        "col": 25,
        "row": 8
      },
      "type": "musketeer",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 0,
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
      "kills": 18
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
      "kills": 1
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
      "kills": 12
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
      "kills": 11
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
  "shots": [],
  "events": [
    {
      "kind": "exit",
      "enemyId": 1404
    },
    {
      "kind": "bossDown",
      "enemyId": 1404,
      "enemyType": "grumblemaw",
      "cause": "exit"
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
