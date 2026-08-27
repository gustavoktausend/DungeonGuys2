import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'public', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    // sim/ must stay pure: no I/O, no DOM, no wall-clock, no unseeded randomness.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'window',                 message: 'sim/ is pure — see plan T1-T6' },
        { name: 'document',               message: 'sim/ is pure — emit an event instead (T5)' },
        { name: 'navigator',              message: 'sim/ is pure — see plan T1-T6' },
        { name: 'localStorage',           message: 'sim/ is pure — pass values via RunConfig (T5)' },
        { name: 'performance',            message: 'use world.tick (T4)' },
        { name: 'requestAnimationFrame',  message: 'sim/ is pure — the loop lives in app/' },
        { name: 'setTimeout',             message: 'sim/ is pure — use world.tick (T4)' },
        { name: 'setInterval',            message: 'sim/ is pure — use world.tick (T4)' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'use world.rng (T3)' },
        { object: 'Date', property: 'now',    message: 'use world.tick (T4)' },
      ],
      'no-restricted-imports': ['error', {
        patterns: ['**/render/**', '**/ui/**', '**/app/**'],
      }],
    },
  },
);
