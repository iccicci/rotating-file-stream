import { utimesSync, writeFileSync } from "node:fs";

import { describe, expect, vi } from "vitest";

import { type RotatingFileStream } from "../../index.ts";
import { type TestRotatingFileStream } from "../unit/helper.ts";
import { type EventEntry, integrationTest, integrationTestEach, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

const line = Buffer.from("test\n");

/** Shared clock and mtime for initialRotation UTC vs local boundary checks (Europe/Rome). */
const initialRotationClockSetup = (emptyFile: boolean): (() => void) => () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2015, 0, 23, 13, 45));
  writeFileSync("test.log", emptyFile ? "" : "test\n");
  utimesSync("test.log", new Date(2015, 0, 23, 12, 45), new Date(2015, 0, 23, 12, 45));
};

const initialRotationTail: EventEntry[] = [
  ["_write", line, "buffer"],
  ["_final"],
  ["finish"],
  ["_destroy", null],
  ["close"]
];

const initialRotationRotateEvents = (rotated: string): EventEntry[] => [
  ["_construct"],
  ["rotation"],
  ["rotated", rotated],
  ["open", "test.log"],
  ...initialRotationTail
];

const initialRotationSkipEvents: EventEntry[] = [["_construct"], ["open", "test.log"], ...initialRotationTail];

/** Wait until the stream emits `open` once. */
const onceOpen = (rfs: RotatingFileStream): Promise<void> => new Promise(resolve => rfs.once("open", () => resolve()));

/** Wait until the stream emits `rotated` once. */
const onceRotated = (rfs: RotatingFileStream): Promise<void> => new Promise(resolve => rfs.once("rotated", () => resolve()));

describe("interval", () => {
  integrationTest({
    description: "initial rotation with interval",
    events:      [
      ["_construct"],
      ["rotation"],
      ["rotated", "20150301-0000-1-test.log"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150301-0000-1-test.log": "test\ntest\n",
      "test.log":                 "test\n"
    },
    run: rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2015, 2, 29, 1, 29, 23, 123));
      writeFileSync("test.log", "test\ntest\n");
    },
    stream: [{ interval: "1M", intervalBoundary: true, size: "10B" }]
  });

  integrationTest({
    description: "size rotation while interval is set",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["rotation"],
      ["rotated", "20150329-0129-1-test.log"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150329-0129-1-test.log": "test\ntest\n",
      "test.log":                 ""
    },
    run: rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2015, 2, 29, 1, 29, 23, 123));
      writeFileSync("test.log", "test\n");
    },
    stream: [{ interval: "1d", size: "10B" }]
  });

  integrationTest({
    description: "initialRotation option",
    events:      [
      ["_construct"],
      ["rotation"],
      ["rotated", "20150123-0000-1-test.log"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150123-0000-1-test.log": "test\n",
      "test.log":                 "test\n"
    },
    run: rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      const mtime = new Date(2015, 0, 23, 1, 29, 23, 123);

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2015, 0, 29, 1, 29, 23, 123));
      writeFileSync("test.log", "test\n");
      utimesSync("test.log", mtime, mtime);
    },
    stream: [{ initialRotation: true, interval: "1d", intervalBoundary: true, size: "10B" }]
  });

  integrationTestEach([
    {
      description: "initialRotation + intervalUTC rotates (intervalBoundary, UTC window boundary in name)",
      events:      initialRotationRotateEvents("20150123-0100-1-test.log"),
      files:       { "20150123-0100-1-test.log": "test\n", "test.log": "test\n" },
      run:         rfs => {
        rfs.end("test\n");
      },
      setup:  initialRotationClockSetup(false),
      stream: [{ initialRotation: true, interval: "12h", intervalBoundary: true, intervalUTC: true, size: "20B" }]
    },
    {
      description: "initialRotation without intervalUTC skips rotation (intervalBoundary, same local 12h window)",
      events:      initialRotationSkipEvents,
      files:       { "test.log": "test\n" },
      run:         rfs => {
        rfs.end("test\n");
      },
      setup:  initialRotationClockSetup(true),
      stream: [{ initialRotation: true, interval: "12h", intervalBoundary: true, size: "20B" }]
    },
    {
      description: "initialRotation + intervalUTC rotates (no intervalBoundary, rotation start time in name)",
      events:      initialRotationRotateEvents("20150123-1345-1-test.log"),
      files:       { "20150123-1345-1-test.log": "test\n", "test.log": "test\n" },
      run:         rfs => {
        rfs.end("test\n");
      },
      setup:  initialRotationClockSetup(false),
      stream: [{ initialRotation: true, interval: "12h", intervalUTC: true, size: "20B" }]
    },
    {
      description: "initialRotation without intervalUTC skips rotation (no intervalBoundary, same local 12h window)",
      events:      initialRotationSkipEvents,
      files:       { "test.log": "test\n" },
      run:         rfs => {
        rfs.end("test\n");
      },
      setup:  initialRotationClockSetup(true),
      stream: [{ initialRotation: true, interval: "12h", size: "20B" }]
    }
  ]);

  integrationTest({
    description: "initialRotation option but ok",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["rotation"],
      ["rotated", "20150329-0000-1-test.log"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150329-0000-1-test.log": "test\ntest\n",
      "test.log":                 ""
    },
    run: rfs => {
      rfs.end("test\n");
    },
    setup: () => {
      const mtime = new Date(2015, 2, 29, 1, 0, 0, 0);

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2015, 2, 29, 1, 29, 23, 123));
      writeFileSync("test.log", "test\n");
      utimesSync("test.log", mtime, mtime);
    },
    stream: [{ initialRotation: true, interval: "1d", intervalBoundary: true, size: "10B" }]
  });

  integrationTest({
    description: "write while rotation",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["rotation"],
      ["_write", line, "buffer"],
      ["rotated", "20150123-0000-test.log"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150123-0000-test.log": "test\ntest\n",
      "test.log":               "test\n"
    },
    run: async rfs => {
      await onceOpen(rfs);
      rfs.once("rotation", () => rfs.end("test\n"));
      await vi.advanceTimersByTimeAsync(20);
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 990));
      writeFileSync("test.log", "test\ntest\n");
    },
    stream: [{ interval: "1s" }]
  });

  integrationTest({
    description: "_write while rotation",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["rotation"],
      ["_write", line, "buffer"],
      ["rotated", "20150123-0000-test.log"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150123-0000-test.log": "test\ntest\n",
      "test.log":               "test\n"
    },
    run: async rfs => {
      await onceOpen(rfs);

      const prev = rfs._write.bind(rfs);

      rfs._write = (chunk, encoding, callback) => {
        rfs.once("rotation", () => prev(chunk, encoding, callback));
      };

      rfs.end("test\n");
      await vi.advanceTimersByTimeAsync(20);
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 990));
      writeFileSync("test.log", "test\ntest\n");
    },
    stream: [{ interval: "1s" }]
  });

  integrationTest({
    description: "rotation while rewrite",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["rotation"],
      ["rotated", "20150123-0000-test.log"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "20150123-0000-test.log": "test\ntest\ntest\n",
      "test.log":               ""
    },
    run: async rfs => {
      const stream = rfs as unknown as TestRotatingFileStream;

      let releaseRewrite!: () => void;
      const rewriteGate = new Promise<void>(resolve => {
        releaseRewrite = resolve;
      });
      let markEntered!: () => void;
      const rewriteEntered = new Promise<void>(resolve => {
        markEntered = resolve;
      });
      let rotationSeen = false;

      // Patch before the first write is drained from the construct queue.
      const prevWrite = rfs._write.bind(rfs);

      rfs._write = (chunk, encoding, callback) => {
        markEntered();

        let release!: () => void;

        stream.rewritePromise = new Promise<void>(resolve => {
          release = resolve;
        });

        void (async () => {
          try {
            await rewriteGate;
            await new Promise<void>((resolve, reject) => {
              prevWrite(chunk, encoding, error => (error ? reject(error) : resolve()));
            });
            callback();
          } catch(error) {
            callback(error instanceof Error ? error : new Error(String(error)));
          } finally {
            release();
            stream.rewritePromise = null;
          }
        })();
      };

      rfs.once("rotation", () => {
        rotationSeen = true;
      });

      await onceOpen(rfs);

      const written = new Promise<void>((resolve, reject) => {
        rfs.write("test\n", error => (error ? reject(error) : resolve()));
      });

      await rewriteEntered;

      const rotated = onceRotated(rfs);

      await vi.advanceTimersByTimeAsync(20);
      for(let i = 0; i < 10; ++i) await Promise.resolve();

      expect(rotationSeen).toBe(false);

      const opened = onceOpen(rfs);

      releaseRewrite();
      await written;
      await rotated;
      await opened;

      rfs.end();
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 990));
      writeFileSync("test.log", "test\ntest\n");
    },
    stream: [{ interval: "1s" }]
  });

  integrationTest({
    description: "monthly rotation",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["rotation"],
      ["_write", line, "buffer"],
      ["rotated", "19760123-0000-test.log"],
      ["open", "test.log"],
      ["rotation"],
      ["_write", line, "buffer"],
      ["rotated", "19760123-0000-1-test.log"],
      ["open", "test.log"],
      ["rotation"],
      ["_write", line, "buffer"],
      ["rotated", "19760123-0000-2-test.log"],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      "19760123-0000-1-test.log": "test\n",
      "19760123-0000-2-test.log": "test\n",
      "19760123-0000-test.log":   "test\ntest\n",
      "test.log":                 "test\n"
    },
    run: async rfs => {
      const stream = rfs as unknown as TestRotatingFileStream;

      await onceOpen(rfs);

      for(let second = 0; second < 3; ++second) {
        const rotated = onceRotated(rfs);
        const opened = onceOpen(rfs);

        vi.setSystemTime(new Date(1976, 0, 23, 0, 0, second, 990));
        stream.clear();
        stream.interval();

        if(second < 2) rfs.once("rotation", () => rfs.write("test\n"));
        else rfs.once("rotation", () => rfs.end("test\n"));

        await vi.advanceTimersByTimeAsync(20);
        await rotated;
        await opened;
      }
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date(1976, 0, 23, 0, 0, 0, 990));
      writeFileSync("test.log", "test\ntest\n");
    },
    stream: [{ interval: "1s" }]
  });

  integrationTest({
    description: "interval only rotates at the boundary",
    events:      [["_construct"], ["open", "test.log"], ["_write", line, "buffer"], ["_final"], ["finish"], ["_destroy", null], ["close"]],
    files:       { "test.log": "test\n" },
    run:         async rfs => {
      await onceOpen(rfs);
      rfs.end("test\n");
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date(2015, 0, 23, 12, 0, 0, 0));
    },
    stream: [{ interval: "1d" }]
  });
});
