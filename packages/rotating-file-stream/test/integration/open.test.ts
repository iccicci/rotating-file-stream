import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { sep } from "node:path";

import { beforeEach, describe, vi } from "vitest";

import { type StandardGenerator } from "../../index.ts";
import { integrationTest, useIntegrationSuite } from "./helper.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fsp>();

  return {
    ...actual,
    unlink: vi.fn(actual.unlink)
  };
});

useIntegrationSuite();

const notAFile = "Can't write on: test.log (it is not a file)";
const tooMany = "Too many destination file attempts";
const line = Buffer.from("test\n");

/** Frozen clock so the veryBad generator can pre-create the first `findName` candidate. */
const frozen = new Date(1976, 0, 23, 15, 23, 0, 0);
const frozenMs = frozen.getTime();

/**
 * Passes `createStream` validation (distinct names for null / index 0-1 × two times),
 * but for every `index` used by `findName` when `options.size` is set (`1`…`1000`)
 * returns a name that already exists on disk.
 */
const veryBad: StandardGenerator = args => {
  if(! args) return "test.log";
  if(args.index <= 1) return `probe-${args.time.getTime()}-${args.index}.log`;

  return "blocked.log";
};

/** Rotated names live under `rot/`; used with a read-only `rot` directory to fail `touch`. */
const intoRot: StandardGenerator = args => (args ? `rot/${args.time.getTime()}-${args.index}.log` : "test.log");

/** Build a generator that passes validation then throws on the first rotation name lookup. */
const throwAfterProbe = (): StandardGenerator => {
  let calls = 0;

  return args => {
    if(! args) return "test.log";

    calls += 1;
    if(calls > 4) throw new Error("test");

    return `${args.time.getTime()}-${args.index}.log`;
  };
};

const stamp = "19760123-1523";
const rotated1 = `${stamp}-1-test.log`;

describe("open", () => {
  integrationTest({
    description: "logging on directory",
    events:      [["_construct"], ["_destroy", notAFile], ["error", notAFile], ["finish"], ["close"]],
    run:         () => undefined,
    setup:       () => {
      mkdirSync("test.log");
    }
  });

  integrationTest({
    description: "logging on directory with write",
    events:      [["_construct"], ["_destroy", notAFile], ["error", notAFile], ["finish"], ["close"]],
    run:         rfs => {
      rfs.write("test\n");
    },
    setup: () => {
      mkdirSync("test.log");
    },
    stream: [{ size: "5B" }]
  });

  integrationTest({
    description: "using file as directory",
    events:      [["_construct"], ["_destroy", "ENOTDIR"], ["error", "ENOTDIR"], ["finish"], ["close"]],
    run:         rfs => {
      rfs.write("test\n");
    },
    setup: () => {
      writeFileSync("index.ts", "x");
    },
    stream: [`index.ts${sep}test.log`, { size: "5B" }]
  });

  integrationTest({
    description: "RO error without write",
    events:      [["_construct"], ["_destroy", "EACCES"], ["error", "EACCES"], ["finish"], ["close"]],
    run:         () => undefined,
    setup:       () => {
      writeFileSync("test.log", "test\n");
      chmodSync("test.log", 0o400);
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "RO error",
    events:      [["_construct"], ["_destroy", "EACCES"], ["error", "EACCES"], ["finish"], ["close"]],
    run:         rfs => {
      rfs.write("test\n");
    },
    setup: () => {
      writeFileSync("test.log", "test\n");
      chmodSync("test.log", 0o400);
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "error while touching rotated file",
    events:      [["_construct"], ["open", "test.log"], ["_write", line, "buffer"], ["rotation"], ["_destroy", "EACCES"], ["error", "EACCES"], ["finish"], ["close"]],
    run:         rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      mkdirSync("rot");
      chmodSync("rot", 0o500);
    },
    stream: [intoRot, { size: "5B" }]
  });

  integrationTest({
    description: "wrong name generator (rotation)",
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
      ["_destroy", "test"],
      ["error", "test"],
      ["finish"],
      ["close"]
    ],
    files: { "test.log": "test\ntest\ntest\n" },
    run:   rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: () => [throwAfterProbe(), { size: "15B" }]
  });

  integrationTest({
    description: "error while unlinking file",
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
      ["_destroy", "test"],
      ["error", "test"],
      ["finish"],
      ["close"]
    ],
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
    },
    setup: () => {
      vi.mocked(fsp.unlink).mockRejectedValue(new Error("test"));
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "ENOENT error while unlinking file",
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
      ["warning", "test"],
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
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
      vi.mocked(fsp.unlink).mockRejectedValue(Object.assign(new Error("test"), { code: "ENOENT" }));
    },
    stream: [{ size: "10B" }]
  });

  describe("standard rotation", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(frozen);
    });

    integrationTest({
      description: "no rotated file available",
      events:      [["_construct"], ["open", "test.log"], ["_write", line, "buffer"], ["rotation"], ["_destroy", tooMany], ["error", tooMany], ["finish"], ["close"]],
      run:         rfs => {
        rfs.end("test\n");
      },
      setup: () => {
        writeFileSync(`probe-${frozenMs}-1.log`, "");
        writeFileSync("blocked.log", "");
      },
      stream: [veryBad, { size: "5B" }]
    });

    integrationTest({
      description: "no rotated file available (existing file)",
      events:      [["_construct"], ["rotation"], ["_destroy", tooMany], ["error", tooMany], ["finish"], ["close"]],
      run:         rfs => {
        rfs.write("test\n");
      },
      setup: () => {
        writeFileSync("test.log", "test\n");
        writeFileSync(`probe-${frozenMs}-1.log`, "");
        writeFileSync("blocked.log", "");
      },
      stream: [veryBad, { size: "5B" }]
    });
  });
});
