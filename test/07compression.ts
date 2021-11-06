"use strict";

import { readFileSync } from "fs";
import { deepStrictEqual as deq, strictEqual as eq } from "assert";
import { gunzipSync } from "zlib";
import { test, v14 } from "./helper";

describe("compression", () => {
  describe("external", () => {
    const events = test(
      {
        filename: (time: number | Date, index: number) => (time ? `test.log/${index}` : "test.log/log"),
        options:  { compress: true, size: "10B" }
      },
      rfs => rfs.end("test\ntest\n")
    );

    it("events", () => deq(events, { finish: 1, open: ["test.log/log", "test.log/log"], rotated: ["test.log/1"], rotation: 1, stderr: [""], stdout: [""], write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log/log", "utf8"), ""));
    it("rotated file content", () => eq(gunzipSync(readFileSync("test.log/1")).toString(), "test\ntest\n"));
  });

  describe("external command error", () => {
    const events = test(
      {
        filename: (time: number | Date, index: number) => (time ? `test.log/${index}` : "test.log/log"),
        options:  { compress: (source, dest) => `echo ${source} ; >&2 echo ${dest} ; exit 23`, size: "10B" }
      },
      rfs => rfs.end("test\ntest\n")
    );

    it("events", () => deq(events, { error: [23], finish: 1, open: ["test.log/log"], rotation: 1, stderr: ["test.log/1\n"], stdout: ["test.log/log\n"], write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log/log", "utf8"), "test\ntest\n"));
  });

  describe("custom external", () => {
    const events = test(
      {
        filename: (time: number | Date, index: number) => (time ? `test${index}.log` : "test.log"),
        options:  { compress: (source: string, dest: string): string => `cat ${source} | gzip -c9 > ${dest}`, size: "10B" }
      },
      rfs => rfs.end("test\ntest\n")
    );

    it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["test1.log"], rotation: 1, stderr: [""], stdout: [""], write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
    it("rotated file content", () => eq(gunzipSync(readFileSync("test1.log")).toString(), "test\ntest\n"));
  });

  describe("generator", () => {
    const events = test({ filename: "test.log", options: { compress: "gzip", mode: 0o660, size: "10B" } }, rfs => {
      rfs.now = (): Date => new Date(2015, 2, 29, 1, 29, 23, 123);
      rfs.end("test\ntest\n");
    });

    it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["20150329-0129-01-test.log.gz"], rotation: 1, write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
    it("rotated file content", () => eq(gunzipSync(readFileSync("20150329-0129-01-test.log.gz")).toString(), "test\ntest\n"));
  });

  describe("internal", () => {
    const events = test({ filename: (time: number | Date, index: number): string => (time ? "log/log/test.gz" + index : "test.log"), options: { compress: "gzip", mode: 0o660, size: "10B" } }, rfs =>
      rfs.end("test\ntest\n")
    );

    it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["log/log/test.gz1"], rotation: 1, write: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
    it("rotated file content", () => eq(gunzipSync(readFileSync("log/log/test.gz1")).toString(), "test\ntest\n"));
  });

  describe("external error", () => {
    const events = test({ options: { compress: true, size: "10B" } }, rfs => {
      rfs.exec = (command: string, callback: (error: Error) => void) => callback(new Error("test"));
      rfs.write("test\ntest\n");
    });

    it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], stderr: [undefined], stdout: [undefined], rotation: 1, write: 1 }));
  });
});
