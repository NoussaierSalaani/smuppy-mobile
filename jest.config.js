/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest for pure TypeScript tests
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testEnvironment: 'node',
  coverageProvider: 'v8',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/aws-migration/',
    '/dist/',
    'src/services/__tests__/',
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
      branches: 1,
      functions: 1,
      lines: 1,
      statements: 1,
    },
  },
  // Ignore module collisions in aws-migration
  modulePathIgnorePatterns: [
    '<rootDir>/aws-migration/infrastructure/cdk.out/',
    '<rootDir>/aws-migration/lambda/layers/',
    '<rootDir>/smuppy-mobile/',
  ],
};
