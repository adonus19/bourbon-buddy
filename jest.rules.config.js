/**
 * Firestore Security Rules integration tests (BB-210).
 *
 * These need the Firestore emulator, so they're split from `npm test` (pure
 * unit). Run via `npm run test:rules`, which wraps jest in
 * `firebase emulators:exec` (requires Java for the emulator).
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/rules/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Standalone node tests — don't inherit the Angular app tsconfig.
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          target: 'es2020',
          esModuleInterop: true,
          strict: true,
          types: ['jest', 'node'],
        },
      },
    ],
  },
  // Emulator round-trips are slower than unit tests.
  testTimeout: 15000,
};
