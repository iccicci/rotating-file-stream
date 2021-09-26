"use strict";

import { close, open, readFileSync, unlink } from "fs";
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

		it("events", () => deq(events, { finish: 1, open: ["test.log/log", "test.log/log"], rotated: ["test.log/1"], rotation: 1, write: 1, ...v14() }));
		it("file content", () => eq(readFileSync("test.log/log", "utf8"), ""));
		it("rotated file content", () => eq(gunzipSync(readFileSync("test.log/1")).toString(), "test\ntest\n"));
	});

	describe("custom external", () => {
		const events = test(
			{
				filename: (time: number | Date, index: number) => (time ? `test${index}.log` : "test.log"),
				options:  { compress: (source: string, dest: string): string => `cat ${source} | gzip -c9 > ${dest}`, size: "10B" }
			},
			rfs => rfs.end("test\ntest\n")
		);

		it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["test1.log"], rotation: 1, write: 1, ...v14() }));
		it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
		it("rotated file content", () => eq(gunzipSync(readFileSync("test1.log")).toString(), "test\ntest\n"));
	});

	describe("internal", () => {
		const events = test({ filename: (time: number | Date, index: number): string => (time ? "log/log/test.gz" + index : "test.log"), options: { compress: "gzip", mode: 0o660, size: "10B" } }, rfs =>
			rfs.end("test\ntest\n")
		);

		it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["log/log/test.gz1"], rotation: 1, write: 1, ...v14() }));
		it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
		it("rotated file content", () => eq(gunzipSync(readFileSync("log/log/test.gz1")).toString(), "test\ntest\n"));
	});

	describe("error finding external tmp file", () => {
		const events = test({ options: { compress: true, size: "10B" } }, rfs => {
			const prev = rfs.findName;
			rfs.findName = (tmp: boolean, callback: (error: Error) => void): void => {
				rfs.findName = (tmp: boolean, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error("test")));
				prev.bind(rfs, tmp, callback)();
			};
			rfs.end("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error creating tmp file", () => {
		const events = test({ options: { compress: true, size: "10B" } }, rfs => {
			rfs.fsOpen = (path: string, flags: string, mode: number, callback: (error: Error) => void): void => {
				rfs.fsOpen = (path: string, flags: string, mode: number, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${path} ${flags} ${mode}`)));
				open(path, flags, mode, callback);
			};
			rfs.end("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test test.log.1.rfs.tmp w 511"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error writing tmp file", () => {
		const events = test({ options: { compress: true, size: "10B" } }, rfs => {
			rfs.fsWrite = (fd: number, data: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${data}`)));
			rfs.end("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test cat test.log | gzip -c9 > 1-test.log"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error closing tmp file", () => {
		const events = test({ options: { compress: true, size: "10B" } }, rfs => {
			rfs.fsClose = (fd: number, callback: (error: Error) => void): void => {
				rfs.fsClose = (fd: number, callback: (error: Error) => void): void => close(fd, () => callback(new Error("test")));
				close(fd, callback);
			};
			rfs.end("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error writing and closing tmp file", () => {
		const events = test({ options: { compress: true, size: "10B" } }, rfs => {
			rfs.fsWrite = (fd: number, data: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${data}`)));
			rfs.fsClose = (fd: number, callback: (error: Error) => void): void => {
				rfs.fsClose = (fd: number, callback: (error: Error) => void): void => close(fd, () => callback(new Error("test")));
				close(fd, callback);
			};
			rfs.end("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test cat test.log | gzip -c9 > 1-test.log"], finish: 1, open: ["test.log"], rotation: 1, warning: ["test"], write: 1 }));
	});

	describe("error unlinking tmp file", () => {
		const events = test({ options: { compress: true, size: "10B" } }, rfs => {
			rfs.fsUnlink = (path: string, callback: (error: Error) => void): void => {
				rfs.fsUnlink = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${path}`)));
				unlink(path, callback);
			};
			rfs.end("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test test.log"], finish: 1, open: ["test.log"], rotation: 1, warning: ["test ./test.log.1.rfs.tmp"], write: 1 }));
	});
});
