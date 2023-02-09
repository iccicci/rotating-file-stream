"use strict";

import { readFileSync } from "fs";
import { deepStrictEqual as deq, strictEqual as eq, throws as ex } from "assert";
import { createStream } from "..";
import { sep } from "path";
import { test } from "./helper";

describe("errors", () => {
  describe("wrong name generator (first time)", () => {
    it("wrong filename type", () =>
      ex(
        () =>
          createStream(() => {
            throw new Error("test");
          }),
        Error("test")
      ));
  });

  describe("wrong name generator (rotation)", () => {
    const events = test(
      {
        filename: (time: number | Date) => {
          if(time) throw new Error("test");
          return "test.log";
        },
        options: { size: "15B" }
      },
      rfs => {
        [0, 0, 0, 0].map(() => rfs.write("test\n"));
        rfs.end("test\n");
      }
    );

    it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1, write: 1, writev: 1 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\ntest\ntest\n"));
  });

  describe("wrong name generator (immutable)", () => {
    const events = test(
      {
        filename: (time: number | Date) => {
          if(time) throw new Error("test");
          return "test.log";
        },
        options: { immutable: true, interval: "1d", size: "5B" }
      },
      rfs => {
        rfs.write("test\n");
        rfs.end("test\n");
      }
    );

    it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, write: 1 }));
  });

  describe("logging on directory", () => {
    const events = test({ filename: "test", options: { size: "5B" } }, rfs => rfs.write("test\n"));

    it("events", () => deq(events, { close: 1, error: ["Can't write on: test (it is not a file)"], finish: 1, write: 1 }));
  });

  describe("logging on directory (immutable)", () => {
    const events = test({ filename: () => "test", options: { immutable: true, interval: "1d", size: "5B" } }, rfs => rfs.write("test\n"));

    it("events", () => deq(events, { close: 1, error: ["Can't write on: 'test' (it is not a file)"], finish: 1, write: 1 }));
  });

  describe("using file as directory", () => {
    const events = test({ filename: `index.ts${sep}test.log`, options: { size: "5B" } }, rfs => rfs.write("test\n"));

    it("events", () => deq(events, { close: 1, error: ["ENOTDIR"], finish: 1, write: 1 }));
  });

  describe("no rotated file available", () => {
    const events = test({ filename: () => "test.log", options: { size: "5B" } }, rfs => rfs.write("test\n"));

    it("events", () => deq(events, { close: 1, error: ["RFS-TOO-MANY"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
  });

  describe("no rotated file available", () => {
    const events = test({ filename: () => "test.log", files: { "test.log": "test\n" }, options: { size: "5B" } }, rfs => rfs.write("test\n"));

    it("events", () => deq(events, { close: 1, error: ["RFS-TOO-MANY"], finish: 1, rotation: 1, write: 1 }));
  });

  describe("error in stat (immutable)", () => {
    const events = test({ options: { immutable: true, interval: "1d", size: "5B" } }, rfs => {
      rfs.fsStat = async (path: string) => {
        throw new Error("test " + path);
      };
      rfs.write("test\ntest\n");
    });

    it("events", () => deq(events, { close: 1, error: ["test 1-test.log"], finish: 1, write: 1 }));
  });

  describe("immutable exhausted", () => {
    const events = test({ filename: () => "test.log", options: { immutable: true, interval: "1d", size: "5B" } }, rfs => rfs.write("test\n"));

    it("events", () => deq(events, { close: 1, error: ["RFS-TOO-MANY"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
  });

  describe("RO error", () => {
    const events = test({ files: { "test.log": { content: "test\n", mode: 0o400 } }, options: { size: "10B" } }, rfs => {
      rfs.write("test\n");
    });

    it("events", () => deq(events, { close: 1, error: ["EACCES"], finish: 1, write: 1 }));
  });

  describe("error in timer after final", () => {
    const events = test({ options: { interval: "1s" } }, rfs => {
      rfs.fsOpen = async () => {
        throw new Error("test");
      };
      setTimeout(() => rfs.end(), 1000);
    });

    it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1 }));
  });

  describe("error while unlinking file", () => {
    const events = test({ options: { size: "10B" } }, rfs => {
      rfs.fsUnlink = async () => {
        throw new Error("test");
      };
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
    });

    it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1, write: 1, writev: 1 }));
  });

  describe("ENOENT error while unlinking file", () => {
    const events = test({ options: { size: "10B" } }, rfs => {
      rfs.fsUnlink = async () => {
        const e = new Error("test");

        (e as any).code = "ENOENT";

        throw e;
      };
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log", "test.log"], rotated: ["1-test.log"], rotation: 1, warning: ["test"], write: 1, writev: 1 }));
  });
});
