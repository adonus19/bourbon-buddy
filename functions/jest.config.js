/** Jest config for Cloud Functions (Node runtime, ts-jest). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.spec.ts"],
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/index.ts", // barrel: re-exports only, no logic
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text-summary", "lcov"],
  /**
   * Coverage ratchet (BB-246). FLOORS, not targets — set just under the measured
   * baseline (2026-09-18: 52.72 / 52.31 / 62.00 / 52.60) so the number can only
   * go up. Raise them when a suite moves the figure; never lower them to make a
   * build pass.
   */
  coverageThreshold: {
    global: {
      statements: 52,
      branches: 51,
      functions: 61,
      lines: 52,
    },
  },
};
