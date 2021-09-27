"use strict";

import { deepStrictEqual as deq, strictEqual as eq } from "assert";
import { readFileSync, unlink } from "fs";
import { createStream } from "..";
import { gte14, test, v14 } from "./helper";

export function v14Error(): { error?: string[] } {
  return gte14 ? {} : { error: ["ERR_STREAM_DESTROYED"] };
}

describe("write(s)", () => {
  describe("single write", () => {
    const events = test({}, rfs => rfs.end("test\n"));

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
  });

  describe("multi write", () => {
    const events = test({ files: { "test.log": "test\n" } }, rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, writev: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\ntest\ntest\ntest\n"));
  });

  describe("end callback", function() {
    const events = test({}, rfs => {
      rfs.end("test\n", "utf8", () => (events.endcb = true));
    });

    it("events", () => deq(events, { endcb: true, finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
  });

  describe("write after open", function() {
    const events = test({}, rfs => rfs.once("open", () => rfs.end("test\n", "utf8")));

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
  });

  describe("destroy before open", function() {
    let stream: any;
    let open: boolean;

    const event = (done?: any): void => {
      open = true;
      if(done) done();
    };

    const events = test({}, rfs => {
      stream = rfs;
      rfs.on("open", () => event());
      rfs.destroy();
      rfs.write("test\n");
    });

    before(done => {
      if(open) return done();
      stream.on("open", () => event(done));
    });

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log"], ...v14Error() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
  });

  describe("destroy between open and write", function() {
    const events = test({}, rfs =>
      rfs.once("open", () => {
        rfs.destroy();
        rfs.write("test\n");
      })
    );

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log"], ...v14Error() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
  });

  describe("destroy while writing", function() {
    const events = test({}, rfs =>
      rfs.once("open", () => {
        rfs.write("test\n");
        rfs.destroy();
      })
    );

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log"], write: 1 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
  });

  describe("destroy after write", function() {
    const events = test({}, rfs =>
      rfs.once("open", () => {
        rfs.write("test\n", () => rfs.destroy());
      })
    );

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log"], write: 1 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
  });

  describe("remove file between writes", function() {
    const events = test({}, rfs => rfs.write("test\n", () => unlink("test.log", () => rfs.end("test\n"))));

    it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], write: 2, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
  });

  describe("two consecutive open in not existing directory", function() {
    let count = 0;

    before(function(done) {
      const rfs1 = createStream("log/test1");
      const rfs2 = createStream("log/test2");

      const open = () => (++count === 2 ? rfs1.end(() => rfs2.end(done)) : null);

      rfs1.on("open", open);
      rfs2.on("open", open);
    });

    it("2 opens", () => eq(2, count));
  });
});
