const { createCjsPreset } = require('jest-preset-angular/presets');

/**
 * Jest config for the Angular app (jest-preset-angular, jsdom, zone-based).
 * Coverage is limited to TS with real logic — model interfaces, NgModules,
 * and routing modules are excluded so the percentage is meaningful.
 */
module.exports = {
  ...createCjsPreset(),
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    '!src/app/**/*.module.ts',
    '!src/app/**/*-routing.module.ts',
    '!src/app/models/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov'],
  /**
   * Coverage ratchet (BB-246). These are FLOORS, not targets — set just under
   * the measured baseline (2026-09-18: 52.94 / 43.00 / 43.63 / 52.67) so the
   * number can only go up. The standing goal is 80% overall and 60% on new
   * code; gating at 80% today would fail every build, and a gate that fails
   * every build gets deleted rather than satisfied.
   *
   * When a suite lands and moves the number, RAISE these to just under the new
   * figure. Never lower them to make a build pass — add the tests instead.
   */
  coverageThreshold: {
    global: {
      statements: 52,
      branches: 42,
      functions: 43,
      lines: 52,
    },
  },
};
