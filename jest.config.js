module.exports = {
  collectCoverageFrom: ["index.ts"],
  preset:              "ts-jest",
  testEnvironment:     "jest-environment-node-single-context",
  testSequencer:       "./testSequencer.js"
};
