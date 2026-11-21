import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/', 'coverage/'],
  },
  ...tseslint.configs.recommended,
  {
    // Boundary: game logic in src/sim stays plain TypeScript so it can be
    // unit tested and simulated headlessly. Rendering belongs in src/game.
    files: ['src/sim/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message:
                'src/sim must not import Phaser. Keep game logic plain TypeScript; rendering lives in src/game.',
            },
          ],
          patterns: [
            {
              group: ['phaser/*', '../game', '../game/*', '**/game/*'],
              message:
                'src/sim must not import from src/game or Phaser. Keep game logic plain TypeScript; rendering lives in src/game.',
            },
          ],
        },
      ],
    },
  },
);
