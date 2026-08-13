import { describe, vi } from "vitest";

import { type StandardGenerator } from "../../index.ts";
import { type EventEntry, integrationTest, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

const probePast = new Date(1976, 0, 23, 15);
const frozen = new Date(2015, 2, 29, 1, 29, 23, 123);
const stamp = "20150329-0129";
const gzRotated = `${stamp}-1-test.log.gz`;

const batchedEnd: EventEntry[] = [["_write", Buffer.from("test\ntest\n"), "buffer"]];

const externalGenerator: StandardGenerator = args => {
  if(! args) return "test.log/log";
  if(args.time.getTime() === probePast.getTime()) return `test.log/probe-${args.index}.log`;

  return `test.log/${args.index}`;
};

const customExternalGenerator: StandardGenerator = args => {
  if(! args) return "test.log";
  if(args.time.getTime() === probePast.getTime()) return `probe-${args.time.getTime()}-${args.index}.log`;

  return `${args.time.getTime()}-${args.index}.log`;
};

const internalGenerator: StandardGenerator = args => {
  if(! args) return "test.log";
  if(args.time.getTime() === probePast.getTime()) return `log/log/probe-${args.index}.log`;

  return `log/log/test.gz${args.index}`;
};

describe("compression", () => {
  integrationTest({
    description: "external",
    events:      [
      ["_construct"],
      ["open", "test.log/log"],
      ...batchedEnd,
      ["rotation"],
      ["external", "", ""],
      ["rotated", "test.log/1"],
      ["open", "test.log/log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "test.log/1":   { unzipped: "test\ntest\n" },
      "test.log/log": ""
    },
    run: rfs => {
      rfs.end("test\ntest\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: [externalGenerator, { compress: true, size: "10B" }]
  });

  integrationTest({
    description: "external command error",
    events:      [
      ["_construct"],
      ["open", "test.log/log"],
      ...batchedEnd,
      ["rotation"],
      ["external", "test.log/log\n", "test.log/1\n"],
      ["_destroy", "23"],
      ["error", "23"],
      ["finish"],
      ["close"]
    ],
    files: {
      "test.log/log": "test\ntest\n"
    },
    run: rfs => {
      rfs.end("test\ntest\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: [
      externalGenerator,
      {
        compress: (source, dest) => `echo ${source} ; >&2 echo ${dest} ; exit 23`,
        size:     "10B"
      }
    ]
  });

  integrationTest({
    description: "custom external",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ...batchedEnd,
      ["rotation"],
      ["external", "", ""],
      ["rotated", `${frozen.getTime()}-1.log`],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`${frozen.getTime()}-1.log`]: { unzipped: "test\ntest\n" },
      "test.log":                    ""
    },
    run: rfs => {
      rfs.end("test\ntest\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: [customExternalGenerator, { compress: (source: string, dest: string): string => `cat ${source} | gzip -c9 > ${dest}`, size: "10B" }]
  });

  integrationTest({
    description: "generator",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ...batchedEnd,
      ["rotation"],
      ["rotated", gzRotated],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [gzRotated]: { unzipped: "test\ntest\n" },
      "test.log":  ""
    },
    run: rfs => {
      rfs.end("test\ntest\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: ["test.log", { compress: "gzip", mode: 0o660, size: "10B" }]
  });

  integrationTest({
    description: "internal",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ...batchedEnd,
      ["rotation"],
      ["rotated", "log/log/test.gz1"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "log/log/test.gz1": { unzipped: "test\ntest\n" },
      "test.log":         ""
    },
    run: rfs => {
      rfs.end("test\ntest\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: [internalGenerator, { compress: "gzip", size: "10B" }]
  });

  integrationTest({
    description: "external error",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", Buffer.from("test\ntest\n"), "buffer"],
      ["rotation"],
      ["external", "", ""],
      ["_destroy", "1"],
      ["error", "1"],
      ["finish"],
      ["close"]
    ],
    files: {
      "test.log": "test\ntest\n"
    },
    run: rfs => {
      rfs.write("test\ntest\n");
    },
    stream: [
      "test.log",
      {
        compress: () => "exit 1",
        size:     "10B"
      }
    ]
  });
});
