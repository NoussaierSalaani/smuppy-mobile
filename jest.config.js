/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest for pure TypeScript tests
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
      },
    }],
  },
  testEnvironment: 'node',
  // Force exit after tests complete to avoid worker hangs from open timers/handles
  forceExit: true,
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
      branches: 78,
      functions: 55,
      lines: 20,
      statements: 20,
    },
  },
  // Coverage Ratchet Plan (thresholds only go UP, never down):
  // Current actual: branches=79.97%, functions=73.71%, lines=20.01%, statements=20.01%
  // Phase 1 (achieved):  branches=51, functions=24, lines=2,  statements=2
  // Phase 2 (achieved):  branches=57, functions=29, lines=2,  statements=2
  // Phase 2.5 (achieved): branches=65, functions=32, lines=3,  statements=3
  // Phase 3 (achieved):  branches=75, functions=49, lines=14, statements=14 (services+hooks+utils+config)
  // Phase 4 (achieved):  branches=78, functions=55, lines=20, statements=20 (screens+config+context)
  // Phase 5 (target):    branches=80, functions=60, lines=30, statements=30
  // Ignore module collisions in aws-migration
  modulePathIgnorePatterns: [
    '<rootDir>/aws-migration/infrastructure/cdk.out/',
    '<rootDir>/aws-migration/lambda/layers/',
    '<rootDir>/smuppy-mobile/',
  ],
};
