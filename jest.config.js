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
};
