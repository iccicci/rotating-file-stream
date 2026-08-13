import { createStream, type ClassicalGenerator, type RotatingFileStream, type StandardGenerator } from "rotating-file-stream";

// Runtime is not executed: `tsc --noEmit` is the assertion for this project.
const standard: StandardGenerator = args => (args ? `${args.index}-e2e.log` : "e2e-types.log");
const classical: ClassicalGenerator = index => (index ? `${index}-e2e.log` : "e2e-types.log");
const stream: RotatingFileStream = createStream(standard);

createStream(classical, { rotate: 1 });
stream.destroy();
