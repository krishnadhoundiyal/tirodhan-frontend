module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/test/**/*.test.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: [
    'src/api/**/*.ts',
    'src/session/**/*.ts',
    'src/notifications/**/*.ts',
  ],
};
