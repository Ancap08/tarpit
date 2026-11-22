// The final state of comboBuild on Normal on Meadow (milestone 27 fixture,
// rewritten in milestone 28 from a JSON dump of the milestone 28 game).
// maps.test.ts checks the game ends exactly so; rewrite it when a game
// number moves.

import type { GameState } from '../types';

export const MEADOW_COMBO_NORMAL: Omit<GameState, 'map'> = {
  "difficulty": "normal",
  "endless": false,
  "phase": "won",
  "gold": 484,
  "lives": 14,
  "wave": 10,
  "specialCharges": 0,
  "tick": 37112,
  "waveTick": 6259,
  "spawnedPerGroup": [
    20,
    15,
    12,
    8,
    1
  ],
  "enemies": [],
  "nextEnemyId": 524,
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
      "kills": 75
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
      "kills": 2
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
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 127
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
      "kills": 4
    },
    {
      "cell": {
        "col": 17,
        "row": 6
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 180,
      "spent": 190,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 108
    },
    {
      "cell": {
        "col": 9,
        "row": 7
      },
      "type": "mortar",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 41,
      "spent": 190,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 44
    },
    {
      "cell": {
        "col": 16,
        "row": 7
      },
      "type": "mortar",
      "upgraded": false,
      "targeting": "first",
      "cooldownTicks": 143,
      "spent": 110,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 4
    },
    {
      "cell": {
        "col": 16,
        "row": 8
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 8,
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
      "cooldownTicks": 8,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 47
    },
    {
      "cell": {
        "col": 14,
        "row": 9
      },
      "type": "firepot",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 68,
      "spent": 120,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 24
    },
    {
      "cell": {
        "col": 16,
        "row": 9
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 22,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 5
    },
    {
      "cell": {
        "col": 17,
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
      "kills": 19
    },
    {
      "cell": {
        "col": 14,
        "row": 10
      },
      "type": "tarpit",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 9,
      "spent": 110,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 18
    },
    {
      "cell": {
        "col": 17,
        "row": 10
      },
      "type": "longbow",
      "upgraded": true,
      "targeting": "first",
      "cooldownTicks": 11,
      "spent": 70,
      "locked": true,
      "unlockedSpend": 0,
      "upgradedThisPhase": false,
      "kills": 8
    }
  ],
  "shots": [
    {
      "cell": {
        "col": 17,
        "row": 6
      },
      "tower": "mortar",
      "targetId": 523,
      "from": {
        "x": 560,
        "y": 208
      },
      "to": {
        "x": 420,
        "y": 369.49999999996726
      },
      "splashRadius": 70
    }
  ],
  "events": [
    {
      "kind": "burn",
      "enemyId": 523,
      "damage": 0.26666666666666666
    },
    {
      "kind": "hit",
      "enemyId": 523,
      "cell": {
        "col": 17,
        "row": 6
      },
      "tower": "mortar",
      "damage": 70
    },
    {
      "kind": "kill",
      "enemyId": 523,
      "enemyType": "boss",
      "bounty": 150,
      "cause": "shot"
    },
    {
      "kind": "bossDown",
      "enemyId": 523,
      "cause": "shot"
    },
    {
      "kind": "waveClear",
      "wave": 10,
      "bonus": 25
    },
    {
      "kind": "won"
    }
  ]
};
