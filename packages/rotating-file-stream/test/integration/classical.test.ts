import { writeFileSync } from "node:fs";
import { sep } from "node:path";

import { describe } from "vitest";

import { type ClassicalGenerator } from "../../index.ts";
import { type EventEntry, integrationTest, type IntegrationTestSpec, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

const line = Buffer.from("test\n");
const threeLines = Buffer.from("test\ntest\ntest\n");
const fourLines = Buffer.from("test\ntest\ntest\ntest\n");
const indexed: ClassicalGenerator = index => (index ? `${index}.test.log` : "test.log");

/** Generator that passes validation then throws during the first rotation rename lookup. */
const throwsOnRotate = (): ClassicalGenerator => {
  let calls = 0;

  return index => {
    if(index === null) return "test.log";

    calls += 1;
    if(calls > 2) throw new Error("test");

    return `${index}.test.log`;
  };
};

const writeTwoThenEnd = (rfs: Parameters<IntegrationTestSpec["run"]>[0]): void => {
  rfs.write("test\n");
  rfs.write("test\n");
  rfs.end("test\n");
};

/** Synchronous writes that batch into a single `_writev` before the first rotation. */
const batchedWriteTwoThenEnd: EventEntry[] = [
  ["_writev", [{ chunk: line, encoding: "buffer" }, { chunk: line, encoding: "buffer" }, { chunk: line, encoding: "buffer" }]]
];

describe("classical", () => {
  integrationTest({
    description: "classical generator",
    events:      [
      ["_construct"],
      ["open", `log${sep}test.log`],
      ...batchedWriteTwoThenEnd,
      ["rotation"],
      ["rotated", `log${sep}test.log.1`],
      ["open", `log${sep}test.log`],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log${sep}test.log.1`]: "test\ntest\n",
      [`log${sep}test.log`]:   "test\n"
    },
    run:    writeTwoThenEnd,
    stream: ["test.log", { path: "log", rotate: 2, size: "10B" }]
  });

  integrationTest({
    description: "classical generator (compress)",
    events:      [
      ["_construct"],
      ["open", `log${sep}test.log`],
      ...batchedWriteTwoThenEnd,
      ["rotation"],
      ["rotated", `log${sep}test.log.1.gz`],
      ["open", `log${sep}test.log`],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log${sep}test.log.1.gz`]: {
        unzipped: "test\ntest\n"
      },
      [`log${sep}test.log`]: "test\n"
    },
    run:    writeTwoThenEnd,
    stream: ["test.log", { compress: "gzip", path: "log", rotate: 2, size: "10B" }]
  });

  integrationTest({
    description: "initial rotation with interval",
    events:      [
      ["_construct"],
      ["rotation"],
      ["rotated", "1.test.log"],
      ["open", "test.log"],
      ["_writev", [{ chunk: line, encoding: "buffer" }, { chunk: line, encoding: "buffer" }]],
      ["rotation"],
      ["rotated", "2.test.log"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "1.test.log": "test\ntest\n",
      "2.test.log": "test\ntest\n",
      "test.log":   ""
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.end("test\n");
    },
    setup: () => {
      writeFileSync("test.log", "test\ntest\n");
    },
    stream: [indexed, { interval: "1d", rotate: 2, size: "10B" }]
  });

  integrationTest({
    description: "rotation overflow",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", fourLines, "buffer"],
      ["rotation"],
      ["rotated", "1.test.log"],
      ["open", "test.log"],
      ["_write", Buffer.from("test\ntest\ntest\n"), "buffer"],
      ["rotation"],
      ["rotated", "2.test.log"],
      ["open", "test.log"],
      ["_write", Buffer.from("test\ntest\n"), "buffer"],
      ["rotation"],
      ["rotated", "2.test.log"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "1.test.log": "test\ntest\n",
      "2.test.log": "test\ntest\ntest\n",
      "test.log":   "test\n"
    },
    run: rfs => {
      rfs.write("test\ntest\ntest\ntest\n", error => {
        if(error) throw error;

        rfs.write("test\ntest\ntest\n", error => {
          if(error) throw error;

          rfs.write("test\ntest\n", error => {
            if(error) throw error;

            rfs.end("test\n");
          });
        });
      });
    },
    stream: [indexed, { rotate: 2, size: "10B" }]
  });

  integrationTest({
    description: "missing directory",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ...batchedWriteTwoThenEnd,
      ["rotation"],
      ["rotated", `log${sep}1.test.log`],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log${sep}1.test.log`]: "test\ntest\n",
      "test.log":              "test\n"
    },
    run:    writeTwoThenEnd,
    stream: [
      (index => (index ? `log${sep}${index}.test.log` : "test.log")) satisfies ClassicalGenerator,
      { rotate: 2, size: "10B" }
    ]
  });

  integrationTest({
    description: "compression",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", threeLines, "buffer"],
      ["rotation"],
      ["rotated", "1.test.log"],
      ["open", "test.log"],
      ["_write", Buffer.from("test\ntest\n"), "buffer"],
      ["rotation"],
      ["rotated", "2.test.log"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "1.test.log": { unzipped: "test\ntest\n" },
      "2.test.log": { unzipped: "test\ntest\ntest\n" },
      "test.log":   "test\n"
    },
    run: rfs => {
      rfs.write("test\ntest\ntest\n", error => {
        if(error) throw error;

        rfs.write("test\ntest\n", error => {
          if(error) throw error;

          rfs.end("test\n");
        });
      });
    },
    stream: [indexed, { compress: "gzip", rotate: 2, size: "10B" }]
  });

  integrationTest({
    description: "rotating on directory which is file",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ...batchedWriteTwoThenEnd,
      ["rotation"],
      ["_destroy", "ENOTDIR"],
      ["error", "ENOTDIR"],
      ["finish"],
      ["close"]
    ],
    files: {
      "test.log": "test\ntest\n"
    },
    run:   writeTwoThenEnd,
    setup: () => {
      writeFileSync("txt", "test\n");
    },
    stream: [
      (index => (index ? `txt${sep}${index}-test.log` : "test.log")) satisfies ClassicalGenerator,
      { rotate: 2, size: "10B" }
    ]
  });

  integrationTest({
    description: "wrong name generator",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ...batchedWriteTwoThenEnd,
      ["rotation"],
      ["_destroy", "test"],
      ["error", "test"],
      ["finish"],
      ["close"]
    ],
    files: {
      "test.log": "test\ntest\n"
    },
    run:    writeTwoThenEnd,
    stream: [throwsOnRotate(), { rotate: 2, size: "10B" }]
  });
});
