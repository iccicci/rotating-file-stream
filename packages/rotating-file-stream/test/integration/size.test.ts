import { mkdirSync, writeFileSync } from "node:fs";
import { sep } from "node:path";

import { beforeEach, describe, expect, vi } from "vitest";

import { type StandardGenerator } from "../../index.ts";
import { integrationTest, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

const line = Buffer.from("test\n");

/** Frozen clock so default / stamped rotated names can be checked. */
const frozen = new Date(1976, 0, 23, 15, 23, 0, 0);
const stamp = "19760123-1523";
const rotated1 = `${stamp}-1-test.log`;
const rotated2 = `${stamp}-2-test.log`;

describe("size", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(frozen);
  });

  integrationTest({
    description: "initial rotation",
    events:      [
      ["_construct"],
      ["rotation"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { [rotated1]: "test\ntest\n", "test.log": "test\n" },
    run:   rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      writeFileSync("test.log", "test\ntest\n");
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "single write rotation by size",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["rotation"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { [rotated1]: "test\ntest\n", "test.log": "" },
    run:   rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      writeFileSync("test.log", "test\n");
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "multi write rotation by size",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [rotated1]: "test\ntest\n",
      "test.log": "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "one write one file",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: Buffer.from("test\ntest\n"), encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [rotated1]: "test\ntest\ntest\ntest\n",
      "test.log": "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\ntest\n");
      rfs.end("test\n");
    },
    setup: () => {
      writeFileSync("test.log", "test\n");
    },
    stream: [{ size: "15B" }]
  });

  integrationTest({
    description: "missing path creation",
    events:      [
      ["_construct"],
      ["open", `log${sep}t${sep}test.log`],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", `log${sep}t${sep}t${sep}${stamp}-1-test.log`],
      ["open", `log${sep}t${sep}test.log`],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log${sep}t${sep}t${sep}${stamp}-1-test.log`]: "test\ntest\n",
      [`log${sep}t${sep}test.log`]:                   "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: [
      ((args: Parameters<StandardGenerator>[0]) => {
        if(! args) return `log${sep}t${sep}test.log`;

        const { index, time } = args;
        const name = `${time.getFullYear()}${String(time.getMonth() + 1).padStart(2, "0")}${String(time.getDate()).padStart(2, "0")}-${String(time.getHours()).padStart(2, "0")}${String(time.getMinutes()).padStart(2, "0")}${index ? `-${index}` : ""}-test.log`;

        return `log${sep}t${sep}t${sep}${name}`;
      }) satisfies StandardGenerator,
      { size: "10B" }
    ]
  });

  integrationTest({
    description: "one writev with more than one rotation",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["rotation"],
      ["rotated", rotated2],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [rotated1]: "test\ntest\n",
      [rotated2]: "test\ntest\n",
      "test.log": "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "single chunk larger than size is never split",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", Buffer.from("abcdefghijkl"), "buffer"],
      ["rotation"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { [rotated1]: "abcdefghijkl", "test.log": "" },
    run:   rfs => {
      rfs.end("abcdefghijkl");
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "skips an existing rotated name",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", rotated2],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [rotated1]: "kept\n",
      [rotated2]: "test\ntest\n",
      "test.log": "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    setup: () => {
      writeFileSync(rotated1, "kept\n");
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "path (ending)",
    events:      [
      ["_construct"],
      ["open", `log${sep}test.log`],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", `log${sep}${rotated1}`],
      ["open", `log${sep}test.log`],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log${sep}${rotated1}`]: "test\ntest\n",
      [`log${sep}test.log`]:    "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: [{ path: `log${sep}`, size: "10B" }]
  });

  integrationTest({
    description: "path (not ending)",
    events:      [
      ["_construct"],
      ["open", `log${sep}test.log`],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", `log${sep}${rotated1}`],
      ["open", `log${sep}test.log`],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log${sep}${rotated1}`]: "test\ntest\n",
      [`log${sep}test.log`]:    "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: [{ path: "log", size: "10B" }]
  });

  integrationTest({
    description: "path relative directory already exists",
    events:      [
      ["_construct"],
      ["open", `log${sep}test.log`],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { [`log${sep}test.log`]: "test\n" },
    run:   rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      mkdirSync("log");
    },
    stream: [{ path: "log", size: "10B" }]
  });

  integrationTest({
    description: "path absolute directory already exists",
    events:      [
      ["_construct"],
      ["open", `abs${sep}test.log`],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { [`abs${sep}test.log`]: "test\n" },
    run:   rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      mkdirSync("abs");
    },
    stream: () => [{ path: `${process.cwd()}${sep}abs`, size: "10B" }]
  });

  integrationTest({
    description: "path absolute directory must be created",
    events:      [
      ["_construct"],
      ["open", `newabs${sep}test.log`],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", `newabs${sep}${rotated1}`],
      ["open", `newabs${sep}test.log`],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`newabs${sep}${rotated1}`]: "test\ntest\n",
      [`newabs${sep}test.log`]:    "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: () => [{ path: `${process.cwd()}${sep}newabs`, size: "10B" }]
  });

  integrationTest({
    assert: () => {
      expect(teeChunks).toEqual([line, line, line]);
    },
    description: "teeToStdout",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", rotated1],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [rotated1]: "test\ntest\n",
      "test.log": "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    setup: () => {
      teeChunks.length = 0;
      vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
        teeChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

        return true;
      }));
    },
    stream: [{ size: "10B", teeToStdout: true }]
  });
});

/** Captured by the teeToStdout integration test. */
const teeChunks: Buffer[] = [];
