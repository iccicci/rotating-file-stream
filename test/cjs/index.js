"use strict";

const assert = require("node:assert/strict");
const { createStream, RotatingFileStream } = require("rotating-file-stream");

assert.equal(typeof createStream, "function");
assert.equal(typeof RotatingFileStream, "function");

const stream = createStream("e2e-cjs.log");

assert.ok(stream instanceof RotatingFileStream);
stream.destroy();

console.log("cjs ok");
