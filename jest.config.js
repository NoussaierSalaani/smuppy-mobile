/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest for pure TypeScript tests
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testEnvironment: 'node',
  coverageProvider: 'v8',
  coverageReporters: ['text', 'text-summary', 'lcov', 'clover'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/aws-migration/',
    '/dist/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: [
    '<rootDir>/src/__tests__/**/*.(spec|test).[jt]s?(x)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 58,
      functions: 29,
      lines: 2,
      statements: 2,
    },
  },
  // Coverage Ratchet Plan (thresholds only go UP, never down):
  // Current actual: branches=58.05%, functions=29.83%, lines=2.69%, statements=2.69%
  // Phase 1 (achieved):  branches=51, functions=24, lines=2,  statements=2
  // Phase 2 (achieved):  branches=58, functions=29, lines=2,  statements=2 (branches+functions exceeded target)
  // Phase 3 (target):    branches=60, functions=50, lines=30, statements=30
  // Phase 4 (target):    branches=70, functions=60, lines=50, statements=50
  // Ignore module collisions in aws-migration
  modulePathIgnorePatterns: [
    '<rootDir>/aws-migration/infrastructure/cdk.out/',
    '<rootDir>/aws-migration/lambda/layers/',
    '<rootDir>/smuppy-mobile/',
  ],
};
