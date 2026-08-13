import { mkdirSync, writeFileSync } from "node:fs";

import { beforeEach, describe, vi } from "vitest";

import { type RotatingFileStream, type StandardGenerator } from "../../index.ts";
import { integrationTest, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

const line = Buffer.from("test\n");
const frozen = new Date(1976, 0, 23, 15, 23, 0, 0);
const stamp = "19760123-1523";
const rotated1 = `${stamp}-1-test.log`;
const rotated2 = `${stamp}-2-test.log`;
const rotated3 = `${stamp}-3-test.log`;
const rotated4 = `${stamp}-4-test.log`;

const writeChunks = [
  Buffer.from("test\ntest\n"),
  Buffer.from("test\ntest\ntest\n"),
  Buffer.from("test\ntest\ntest\ntest\n"),
  Buffer.from("test\ntest\ntest\ntest\ntest\n"),
  Buffer.from("test\ntest\ntest\ntest\ntest\ntest\n"),
  line
];

const writev = writeChunks.map(chunk => ({ chunk, encoding: "buffer" as const }));
const immutableWritev = [
  ...writeChunks.slice(0, 4).map(chunk => ({ chunk, encoding: "buffer" as const })),
  { chunk: line, encoding: "buffer" as const }
];

const formatStamp = (time: Date): string =>
  `${time.getFullYear()}${String(time.getMonth() + 1).padStart(2, "0")}${String(time.getDate()).padStart(2, "0")}-${String(time.getHours()).padStart(2, "0")}${String(time.getMinutes()).padStart(2, "0")}`;

const immutableGen: StandardGenerator = args => {
  if(! args) return "test.log";

  return `${formatStamp(args.time)}-${args.index}-test.log`;
};

/** Advance immutable clock between rotation slots. */
const tickNow = (rfs: RotatingFileStream): void => {
  let minute = 0;
  const stream = rfs as unknown as { now: () => Date };

  stream.now = () => new Date(2015, 0, 23, 1, ++minute, 23, 123);
};

describe("history", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(frozen);
  });

  integrationTest({
    description: "maxFiles",
    events:      [
      ["_construct"],
      ["open", "log/test.log"],
      ["_writev", writev],
      ["rotation"],
      ["warning", "File 'test' contained in history is not a regular file"],
      ["history"],
      ["rotated", `log/${rotated1}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["history"],
      ["rotated", `log/${rotated2}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["history"],
      ["rotated", `log/${rotated3}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["removed", `log/${rotated1}`, true],
      ["history"],
      ["rotated", `log/${rotated4}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["removed", `log/${rotated2}`, true],
      ["history"],
      ["rotated", `log/${rotated1}`],
      ["open", "log/test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log/${rotated1}`]: "test\ntest\ntest\ntest\ntest\ntest\n",
      [`log/${rotated3}`]: "test\ntest\ntest\ntest\n",
      [`log/${rotated4}`]: "test\ntest\ntest\ntest\ntest\n",
      "log/test.log":      "test\n"
    },
    run: rfs => {
      rfs.write("test\ntest\n");
      rfs.write("test\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\ntest\ntest\n");
      rfs.end("test\n");
    },
    setup: () => {
      mkdirSync("log", { recursive: true });
      mkdirSync("test");
      writeFileSync("log/files.txt", "test\nnone\n");
    },
    stream: [{ history: "files.txt", maxFiles: 3, path: "log", size: "10B" }]
  });

  integrationTest({
    description: "maxFiles 1",
    events:      [
      ["_construct"],
      ["open", "log/test.log"],
      ["_writev", writev],
      ["rotation"],
      ["warning", "File 'test' contained in history is not a regular file"],
      ["history"],
      ["rotated", `log/${rotated1}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["removed", `log/${rotated1}`, true],
      ["history"],
      ["rotated", `log/${rotated2}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["removed", `log/${rotated2}`, true],
      ["history"],
      ["rotated", `log/${rotated1}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["removed", `log/${rotated1}`, true],
      ["history"],
      ["rotated", `log/${rotated2}`],
      ["open", "log/test.log"],
      ["rotation"],
      ["removed", `log/${rotated2}`, true],
      ["history"],
      ["rotated", `log/${rotated1}`],
      ["open", "log/test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log/${rotated1}`]: "test\ntest\ntest\ntest\ntest\ntest\n",
      "log/test.log":      "test\n"
    },
    run: rfs => {
      rfs.write("test\ntest\n");
      rfs.write("test\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\ntest\ntest\n");
      rfs.end("test\n");
    },
    setup: () => {
      mkdirSync("log", { recursive: true });
      mkdirSync("test");
      writeFileSync("log/files.txt", "test\nnone\n");
    },
    stream: [{ history: "files.txt", maxFiles: 1, path: "log", size: "10B" }]
  });

  integrationTest({
    description: "maxSize",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_writev", writev],
      ["rotation"],
      ["history"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["rotation"],
      ["history"],
      ["rotated", rotated2],
      ["open", "test.log"],
      ["rotation"],
      ["history"],
      ["rotated", rotated3],
      ["open", "test.log"],
      ["rotation"],
      ["removed", rotated1, false],
      ["history"],
      ["rotated", rotated4],
      ["open", "test.log"],
      ["rotation"],
      ["removed", rotated2, false],
      ["removed", rotated3, false],
      ["history"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [rotated1]: "test\ntest\ntest\ntest\ntest\ntest\n",
      [rotated4]: "test\ntest\ntest\ntest\ntest\n",
      "test.log": "test\n"
    },
    run: rfs => {
      rfs.write("test\ntest\n");
      rfs.write("test\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\ntest\ntest\n");
      rfs.end("test\n");
    },
    stream: [{ maxSize: "60B", size: "10B" }]
  });

  integrationTest({
    description: "immutable maxFiles",
    events:      [
      ["_construct"],
      ["open", "20150123-0101-1-test.log"],
      ["_writev", immutableWritev],
      ["rotation"],
      ["history"],
      ["rotated", "20150123-0101-1-test.log"],
      ["open", "20150123-0105-1-test.log"],
      ["rotation"],
      ["history"],
      ["rotated", "20150123-0105-1-test.log"],
      ["open", "20150123-0109-1-test.log"],
      ["rotation"],
      ["removed", "20150123-0101-1-test.log", true],
      ["history"],
      ["rotated", "20150123-0109-1-test.log"],
      ["open", "20150123-0113-1-test.log"],
      ["rotation"],
      ["removed", "20150123-0105-1-test.log", true],
      ["history"],
      ["rotated", "20150123-0113-1-test.log"],
      ["open", "20150123-0117-1-test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150123-0109-1-test.log": "test\ntest\ntest\ntest\n",
      "20150123-0113-1-test.log": "test\ntest\ntest\ntest\ntest\n",
      "20150123-0117-1-test.log": "test\n"
    },
    run: rfs => {
      tickNow(rfs);
      rfs.write("test\ntest\n");
      rfs.write("test\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\ntest\ntest\n");
      rfs.end("test\n");
    },
    stream: [immutableGen, { immutable: true, interval: "1d", maxFiles: 2, size: "10B" }]
  });
});
