"use strict";

import { deepStrictEqual as deq, strictEqual as eq } from "assert";
import { gunzipSync } from "zlib";
import { readFileSync } from "fs";
import { sep } from "path";
import { test, v14 } from "./helper";

describe("options", () => {
  describe("size KiloBytes", () => {
    let size: number;
    const events = test({ options: { size: "10K" } }, rfs => rfs.end("test\n", () => (size = rfs.options.size)));

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("10K", () => eq(size, 10240));
  });

  describe("size MegaBytes", () => {
    let size: number;
    const events = test({ options: { size: "10M" } }, rfs => rfs.end("test\n", () => (size = rfs.options.size)));

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("10M", () => eq(size, 10485760));
  });

  describe("size GigaBytes", () => {
    let size: number;
    const events = test({ options: { size: "10G" } }, rfs => rfs.end("test\n", () => (size = rfs.options.size)));

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("10G", () => eq(size, 10737418240));
  });

  describe("interval minutes", () => {
    let interval: number;
    const events = test({ options: { interval: "3m" } }, rfs => rfs.end("test\n", () => (interval = rfs.options.interval)));

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("3'", () => deq(interval, { num: 3, unit: "m" }));
  });

  describe("interval hours", () => {
    let interval: number, next: number, prev: number;
    const events = test({ options: { interval: "3h" } }, rfs =>
      rfs.end("test\n", () => {
        interval = rfs.options.interval;
        rfs.intervalBounds(new Date(2015, 2, 29, 1, 29, 23, 123));
        ({ next, prev } = rfs);
      })
    );

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("3h", () => deq(interval, { num: 3, unit: "h" }));
    it("hours daylight saving", () => eq(next - prev, 7200000));
  });

  describe("interval days", () => {
    let interval: number, next: number, prev: number;
    const events = test({ options: { interval: "3d" } }, rfs =>
      rfs.end("test\n", () => {
        interval = rfs.options.interval;
        rfs.intervalBounds(new Date(2015, 2, 29, 1, 29, 23, 123));
        ({ next, prev } = rfs);
      })
    );

    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, ...v14() }));
    it("3h", () => deq(interval, { num: 3, unit: "d" }));
    it("hours daylight saving", () => eq(next - prev, 255600000));
  });

  describe("path (ending)", () => {
    const filename = `log${sep}test.log`;
    const rotated = `log${sep}1-test.log`;
    const events = test({ options: { path: "log" + sep, size: "10B" } }, rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { finish: 1, open: [filename, filename], rotated: [rotated], rotation: 1, write: 1, writev: 1, ...v14() }));
    it("file content", () => eq(readFileSync(filename, "utf8"), "test\n"));
    it("rotated file content", () => eq(readFileSync(rotated, "utf8"), "test\ntest\n"));
  });

  describe("path (not ending)", () => {
    const filename = `log${sep}test.log`;
    const rotated = `log${sep}1-test.log`;
    const events = test({ options: { path: "log", size: "10B" } }, rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { finish: 1, open: [filename, filename], rotated: [rotated], rotation: 1, write: 1, writev: 1, ...v14() }));
    it("file content", () => eq(readFileSync(filename, "utf8"), "test\n"));
    it("rotated file content", () => eq(readFileSync(rotated, "utf8"), "test\ntest\n"));
  });

  describe("safe options object", () => {
    let options: any;
    const events = test({ options: { interval: "1d", rotate: 5, size: "10M" } }, rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
      options = rfs.options;
    });

    it("options", () => deq(options, { interval: { num: 1, unit: "d" }, path: "", rotate: 5, size: 10485760 }));
    it("events", () => deq(events, { finish: 1, open: ["test.log"], write: 1, writev: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\ntest\ntest\n"));
  });

  describe("immutable", () => {
    const events = test({ options: { immutable: true, interval: "1d", path: "log", size: "10B" } }, rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { finish: 1, open: ["log/1-test.log", "log/2-test.log"], rotated: ["log/1-test.log"], rotation: 1, write: 1, writev: 1, ...v14() }));
    it("first file content", () => eq(readFileSync("log/1-test.log", "utf8"), "test\ntest\n"));
    it("second file content", () => eq(readFileSync("log/2-test.log", "utf8"), "test\n"));
  });

  describe("immutable with file", () => {
    const events = test({ files: { "1-test.log": "test\n" }, options: { immutable: true, interval: "1d", size: "10B" } }, rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { finish: 1, open: ["1-test.log", "2-test.log", "3-test.log"], rotated: ["1-test.log", "2-test.log"], rotation: 2, write: 1, writev: 1, ...v14() }));
    it("first file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\n"));
    it("second file content", () => eq(readFileSync("2-test.log", "utf8"), "test\ntest\n"));
    it("third file content", () => eq(readFileSync("3-test.log", "utf8"), "test\n"));
  });

  describe("teeToStdout", () => {
    const content: Buffer[] = [];

    const events = test({ options: { size: "10B", teeToStdout: true } }, rfs => {
      rfs.stdout = { write: (buffer: Buffer): number => content.push(buffer) };
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["1-test.log"], rotation: 1, write: 1, writev: 1, ...v14() }));
    it("stdout", () => deq(content, [Buffer.from("test\n"), Buffer.from("test\n"), Buffer.from("test\n")]));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
    it("rotated file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\n"));
  });

  describe("omitExtension", () => {
    const content: Buffer[] = [];

    const events = test({ options: { compress: "gzip", omitExtension: true, size: "10B" } }, rfs => {
      rfs.stdout = { write: (buffer: Buffer): number => content.push(buffer) };
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    });

    it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["1-test.log"], rotation: 1, write: 1, writev: 1, ...v14() }));
    it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
    it("rotated file content", () => eq(gunzipSync(readFileSync("1-test.log")).toString(), "test\ntest\n"));
  });
});
