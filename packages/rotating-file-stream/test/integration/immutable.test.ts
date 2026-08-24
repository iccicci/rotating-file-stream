import { mkdirSync, writeFileSync } from "node:fs";
import * as fsp from "node:fs/promises";

import { describe, expect, vi } from "vitest";

import { type StandardGenerator } from "../../index.ts";
import { integrationTest, useIntegrationSuite } from "./helper.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fsp>();

  return {
    ...actual,
    stat: vi.fn(actual.stat)
  };
});

useIntegrationSuite();

const line = Buffer.from("test\n");
const probePast = new Date(1976, 0, 23, 15);
const frozen = new Date(2015, 0, 23, 1, 0, 0, 0);
const frozenStamp = "20150123-0100";
const slot1 = `${frozenStamp}-1-test.log`;
const slot2 = `${frozenStamp}-2-test.log`;
const slot3 = `${frozenStamp}-3-test.log`;

const formatStamp = (time: Date): string =>
  `${time.getFullYear()}${String(time.getMonth() + 1).padStart(2, "0")}${String(time.getDate()).padStart(2, "0")}-${String(time.getHours()).padStart(2, "0")}${String(time.getMinutes()).padStart(2, "0")}`;

const rotatedName = (time: Date, index: number): string => `${formatStamp(time)}-${index}-test.log`;

const probeName = (time: Date, index: number): string => `probe-${formatStamp(time)}-${index}.log`;

/** Immutable generator: probe-safe names, time-and-index names under the frozen clock. */
const indexed: StandardGenerator = args => {
  if(! args) return "test.log";
  if(args.time.getTime() === probePast.getTime()) return probeName(args.time, args.index);

  return rotatedName(args.time, args.index);
};

/** Generator that always resolves to the same rotated file name (exhaustion scenario). */
const constant: StandardGenerator = args => {
  if(! args) return "live.log";
  if(args.time.getTime() === probePast.getTime()) return probeName(args.time, args.index);
  if(args.time.getTime() === frozen.getTime()) return "test.log";

  return `validation-${formatStamp(args.time)}-${args.index}.log`;
};

/** Generator that throws once createStream validation has finished probing it. */
const throwsOnRotate = (): StandardGenerator => {
  let calls = 0;

  return args => {
    if(! args) return "test.log";

    calls += 1;
    if(calls > 4) throw new Error("test");

    return `${args.time.getTime()}-${args.index}.log`;
  };
};

/** Generator that returns a fixed directory path for the first rotated slot. */
const directoryName: StandardGenerator = args => {
  if(! args) return "test.log";
  if(args.time.getTime() === probePast.getTime()) return probeName(args.time, args.index);
  if(args.index === 1) return "test";

  return rotatedName(args.time, args.index);
};

describe("immutable", () => {
  integrationTest({
    description: "immutable",
    events:      [
      ["_construct"],
      ["open", `log/${slot1}`],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", `log/${slot1}`],
      ["open", `log/${slot2}`],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log/${slot1}`]: "test\ntest\n",
      [`log/${slot2}`]: "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: [indexed, { immutable: true, interval: "1d", path: "log", size: "10B" }]
  });

  integrationTest({
    description: "immutable with file",
    events:      [
      ["_construct"],
      ["open", slot1],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", slot1],
      ["open", slot2],
      ["rotation"],
      ["rotated", slot2],
      ["open", slot3],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [slot1]: "test\ntest\n",
      [slot2]: "test\ntest\n",
      [slot3]: "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
      writeFileSync(slot1, "test\n");
    },
    stream: [indexed, { immutable: true, interval: "1d", size: "10B" }]
  });

  integrationTest({
    assert: async () => {
      expect(await fsp.readlink("test.log")).toBe(slot2);
    },
    description: "symLink points at the current immutable file",
    events:      [
      ["_construct"],
      ["open", slot1],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["rotation"],
      ["rotated", slot1],
      ["open", slot2],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [slot1]: "test\ntest\n",
      [slot2]: "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: [indexed, { immutable: true, interval: "1d", size: "10B", symLink: true }]
  });

  integrationTest({
    assert: async () => {
      expect(await fsp.readlink("log/test.log")).toBe(slot1);
    },
    description: "symLink with path",
    events:      [
      ["_construct"],
      ["open", `log/${slot1}`],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [`log/${slot1}`]: "test\n"
    },
    run: rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    },
    stream: [indexed, { immutable: true, interval: "1d", path: "log", symLink: true }]
  });

  integrationTest({
    description: "wrong name generator (immutable)",
    events:      [
      ["_construct"],
      ["_destroy", "test"],
      ["error", "test"],
      ["finish"],
      ["close"]
    ],
    run: rfs => {
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: [throwsOnRotate(), { immutable: true, interval: "1d", size: "5B" }]
  });

  integrationTest({
    description: "logging on directory (immutable)",
    events:      [
      ["_construct"],
      ["_destroy", "Can't write on: 'test' (it is not a file)"],
      ["error", "Can't write on: 'test' (it is not a file)"],
      ["finish"],
      ["close"]
    ],
    run: rfs => {
      rfs.write("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
      mkdirSync("test");
    },
    stream: [directoryName, { immutable: true, interval: "1d", size: "5B" }]
  });

  integrationTest({
    description: "immutable exhausted",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["rotation"],
      ["_destroy", "Too many destination file attempts"],
      ["error", "Too many destination file attempts"],
      ["finish"],
      ["close"]
    ],
    run: rfs => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
      rfs.write("test\n");
    },
    stream: [constant, { immutable: true, interval: "1d", size: "5B" }]
  });

  integrationTest({
    description: "error in stat (immutable)",
    events:      [
      ["_construct"],
      ["_destroy", `test ${slot1}`],
      ["error", `test ${slot1}`],
      ["finish"],
      ["close"]
    ],
    run: rfs => {
      rfs.write("test\ntest\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
      vi.mocked(fsp.stat).mockRejectedValue(new Error(`test ${slot1}`));
    },
    stream: [indexed, { immutable: true, interval: "1d", size: "5B" }]
  });
});
