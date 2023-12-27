"use strict";

import { deepStrictEqual as deq, strictEqual as eq } from "assert";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { sep } from "path";
import { test } from "./helper";

describe("classical", function() {
  describe("classical generator", () => {
    const events = test({ filename: "test.log", options: { path: "log", rotate: 2, size: "10B" } }, rfs => {
      rfs.write("test\ntest\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { close: 1, finish: 1, open: ["log/test.log", "log/test.log"], rotated: ["log/test.log.1"], rotation: 1, write: 2 }));
    it("file content", () => eq(readFileSync("log/test.log", "utf8"), "test\n"));
    it("rotated file content", () => eq(readFileSync("log/test.log.1", "utf8"), "test\ntest\n"));
  });

  describe("classical generator (compress)", () => {
    const events = test({ filename: "test.log", options: { compress: "gzip", path: "log", rotate: 2, size: "10B" } }, rfs => {
      rfs.write("test\ntest\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { close: 1, finish: 1, open: ["log/test.log", "log/test.log"], rotated: ["log/test.log.1.gz"], rotation: 1, write: 2 }));
    it("file content", () => eq(readFileSync("log/test.log", "utf8"), "test\n"));
    it("rotated file content", () => eq(gunzipSync(readFileSync("log/test.log.1.gz")).toString(), "test\ntest\n"));
  });

  describe("initial rotation with interval", () => {
    const events = test(
      { filename: (index?: number | Date): string => (index ? `${index}.test.log` : "test.log"), files: { "test.log": "test\ntest\n" }, options: { interval: "1d", rotate: 2, size: "10B" } },
      rfs => {
        rfs.write("test\n");
        rfs.end("test\n");
      }
    );

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log", "test.log"], rotated: ["1.test.log", "2.test.log"], rotation: 2, write: 2 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
    it("first rotated file content", () => eq(readFileSync("1.test.log", "utf8"), "test\ntest\n"));
    it("second rotated file content", () => eq(readFileSync("2.test.log", "utf8"), "test\ntest\n"));
  });

  describe("rotation overflow", () => {
    const events = test({ filename: (index?: number | Date): string => (index ? `${index}.test.log` : "test.log"), options: { rotate: 2, size: "10B" } }, rfs => {
      rfs.write("test\ntest\ntest\ntest\n");
      rfs.write("test\ntest\ntest\n");
      rfs.write("test\ntest\n");
      rfs.end("test\n");
    });

    it("events", () =>
      deq(events, { close: 1, finish: 1, open: ["test.log", "test.log", "test.log", "test.log"], rotated: ["1.test.log", "2.test.log", "2.test.log"], rotation: 3, write: 1, writev: 1 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
    it("first rotated file content", () => eq(readFileSync("1.test.log", "utf8"), "test\ntest\n"));
    it("second rotated file content", () => eq(readFileSync("2.test.log", "utf8"), "test\ntest\ntest\n"));
  });

  describe("missing directory", () => {
    const events = test({ filename: (index?: number | Date): string => (index ? `log${sep}${index}.test.log` : "test.log"), options: { rotate: 2, size: "10B" } }, rfs => {
      rfs.write("test\ntest\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log", "test.log"], rotated: ["log/1.test.log"], rotation: 1, write: 2 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
    it("rotated file content", () => eq(readFileSync("log/1.test.log", "utf8"), "test\ntest\n"));
  });

  describe("compression", () => {
    const events = test({ filename: (index?: number | Date): string => (index ? `${index}.test.log` : "test.log"), options: { compress: "gzip", rotate: 2, size: "10B" } }, rfs => {
      rfs.write("test\ntest\ntest\n");
      rfs.write("test\ntest\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { close: 1, finish: 1, open: ["test.log", "test.log", "test.log"], rotated: ["1.test.log", "2.test.log"], rotation: 2, write: 1, writev: 1 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
    it("first rotated file content", () => eq(gunzipSync(readFileSync("1.test.log")).toString(), "test\ntest\n"));
    it("second rotated file content", () => eq(gunzipSync(readFileSync("2.test.log")).toString(), "test\ntest\ntest\n"));
  });

  describe("rotating on directory which is file", () => {
    const events = test({ filename: (index?: number | Date): string => (index ? "txt/test.log" : "test.log"), files: { txt: "test\n" }, options: { rotate: 2, size: "10B" } }, rfs => {
      rfs.write("test\ntest\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { close: 1, error: ["ENOTDIR"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\ntest\n"));
  });

  describe("wrong name generator", () => {
    const events = test(
      {
        filename: (index?: number | Date): string => {
          if(index) throw new Error("test");
          return "test.log";
        },
        options: { rotate: 2, size: "10B" }
      },
      rfs => {
        rfs.write("test\ntest\n");
        rfs.end("test\n");
      }
    );

    it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\ntest\n"));
  });
});
