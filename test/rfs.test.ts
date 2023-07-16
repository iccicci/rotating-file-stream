import { unlink } from "fs/promises";
import { Writable } from "stream";

import { createStream, RotatingFileStream } from "..";

describe("rotating-file-stream", () => {
  afterAll(() => unlink("test.log"));

  describe("new", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rfs: any;

    beforeAll(done => {
      rfs = createStream("test.log", { mode: parseInt("666", 8) });
      rfs.end(done);
    });

    it("RotatingFileStream", () => expect(rfs).toBeInstanceOf(RotatingFileStream));
    it("Writable", () => expect(rfs).toBeInstanceOf(Writable));
    it("std filename generator first time", () => expect(rfs.generator(null)).toBe("test.log"));
    it("std filename generator later times", () =>
      expect(rfs.generator(new Date("1976-01-23 14:45"), 4)).toBe("19760123-1445-04-test.log"));
  });

  describe("new no options", () => {
    it("no error", done => {
      createStream("test.log").end(done);
    });
  });

  describe("wrong calls", () => {
    it("wrong filename type", () =>
      expect(() => createStream({} as string)).toThrow(
        new Error('The "filename" argument must be one of type string or function. Received type object')
      ));
    it("wrong options type", () =>
      expect(() => createStream("test.log", "test.log" as never)).toThrow(
        new Error('The "options" argument must be of type object. Received type string')
      ));
    it("unknown option", () =>
      expect(() => createStream("test.log", { test: true } as never)).toThrow(new Error("Unknown option: test")));
    it("no compress value", () =>
      expect(() => createStream("test.log", { compress: false })).toThrow(
        new Error("A value for 'options.compress' must be specified")
      ));
    it("wrong compress type", () =>
      expect(() => createStream("test.log", { compress: 23 } as never)).toThrow(
        new Error("Don't know how to handle 'options.compress' type: number")
      ));
    it("wrong compress method", () =>
      expect(() => createStream("test.log", { compress: "test" })).toThrow(
        new Error("Don't know how to handle compression method: test")
      ));
    it("wrong interval type", () =>
      expect(() => createStream("test.log", { interval: 23 } as never)).toThrow(
        new Error("Don't know how to handle 'options.interval' type: number")
      ));
    it("wrong path type", () =>
      expect(() => createStream("test.log", { path: 23 } as never)).toThrow(
        new Error("Don't know how to handle 'options.path' type: number")
      ));
    it("wrong size type", () =>
      expect(() => createStream("test.log", { size: 23 } as never)).toThrow(
        new Error("Don't know how to handle 'options.size' type: number")
      ));
    it("wrong size type", () =>
      expect(() => createStream("test.log", { size: "test" })).toThrow(
        new Error("Unknown 'options.size' format: test")
      ));
    it("wrong size number", () =>
      expect(() => createStream("test.log", { size: "-23B" })).toThrow(
        new Error("A positive integer number is expected for 'options.size'")
      ));
    it("missing size unit", () =>
      expect(() => createStream("test.log", { size: "23" })).toThrow(new Error("Missing unit for 'options.size'")));
    it("wrong size unit", () =>
      expect(() => createStream("test.log", { size: "23test" })).toThrow(new Error("Unknown 'options.size' unit: t")));
    it("wrong interval seconds number", () =>
      expect(() => createStream("test.log", { interval: "23s" })).toThrow(
        new Error("An integer divider of 60 is expected as seconds for 'options.interval'")
      ));
    it("wrong interval minutes number", () =>
      expect(() => createStream("test.log", { interval: "23m" })).toThrow(
        new Error("An integer divider of 60 is expected as minutes for 'options.interval'")
      ));
    it("wrong interval hours number", () =>
      expect(() => createStream("test.log", { interval: "23h" })).toThrow(
        new Error("An integer divider of 24 is expected as hours for 'options.interval'")
      ));
    it("string rotate value", () =>
      expect(() => createStream("test.log", { rotate: "test" } as never)).toThrow(
        new Error("'rotate' option must be a positive integer number")
      ));
    it("negative rotate value", () =>
      expect(() => createStream("test.log", { rotate: -23 })).toThrow(
        new Error("'rotate' option must be a positive integer number")
      ));
    it("wrong history", () =>
      expect(() => createStream("test.log", { history: {} } as never)).toThrow(
        new Error("Don't know how to handle 'options.history' type: object")
      ));
    it("wrong maxFiles", () =>
      expect(() => createStream("test.log", { maxFiles: {} } as never)).toThrow(
        new Error("'maxFiles' option must be a positive integer number")
      ));
    it("negative maxFiles", () =>
      expect(() => createStream("test.log", { maxFiles: -23 })).toThrow(
        new Error("'maxFiles' option must be a positive integer number")
      ));
    it("wrong maxSize", () =>
      expect(() => createStream("test.log", { maxSize: "-23B" })).toThrow(
        new Error("A positive integer number is expected for 'options.size'")
      ));
    it("wrong encoding", () =>
      expect(() => createStream("test.log", { encoding: "test" as BufferEncoding })).toThrow(
        new RangeError('The "test" encoding is not supported')
      ));
  });
});
