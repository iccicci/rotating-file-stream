import assert from "node:assert/strict";
import { createStream, RotatingFileStream } from "rotating-file-stream";

assert.equal(typeof createStream, "function");
assert.equal(typeof RotatingFileStream, "function");

const stream = createStream("e2e-esm.log");

assert.ok(stream instanceof RotatingFileStream);
stream.destroy();

console.log("esm ok");
