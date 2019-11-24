"use strict";

import { deepStrictEqual as deq, strictEqual as eq } from "assert";
import { readFileSync } from "fs";
import { test } from "./helper";

describe("history", () => {
	describe("maxFiles", () => {
		const events = test({ files: { "log/files.txt": "test\nnone\n" }, options: { history: "files.txt", maxFiles: 3, path: "log", size: "10B" } }, rfs => {
			rfs.write("test\ntest\n");
			rfs.write("test\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\ntest\ntest\n");
			rfs.end("test\n");
		});

		it("events", () =>
			deq(events, {
				finish:   1,
				history:  5,
				open:     ["log/test.log", "log/test.log", "log/test.log", "log/test.log", "log/test.log", "log/test.log"],
				removedn: ["log/1-test.log", "log/2-test.log"],
				rotated:  ["log/1-test.log", "log/2-test.log", "log/3-test.log", "log/4-test.log", "log/1-test.log"],
				rotation: 5,
				warning:  ["File 'test' contained in history is not a regular file"],
				write:    1,
				writev:   1
			}));
		it("file content", () => eq(readFileSync("log/test.log", "utf8"), "test\n"));
		it("first rotated file content", () => eq(readFileSync("log/3-test.log", "utf8"), "test\ntest\ntest\ntest\n"));
		it("second rotated file content", () => eq(readFileSync("log/4-test.log", "utf8"), "test\ntest\ntest\ntest\ntest\n"));
		it("third rotated file content", () => eq(readFileSync("log/1-test.log", "utf8"), "test\ntest\ntest\ntest\ntest\ntest\n"));
		it("history file content", () => eq(readFileSync("log/files.txt", "utf8"), "log/3-test.log\nlog/4-test.log\nlog/1-test.log\n"));
	});

	describe("maxSize", () => {
		const events = test({ options: { maxSize: "60B", size: "10B" } }, rfs => {
			rfs.write("test\ntest\n");
			rfs.write("test\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\ntest\ntest\n");
			rfs.end("test\n");
		});

		it("events", () =>
			deq(events, {
				finish:   1,
				history:  5,
				open:     ["test.log", "test.log", "test.log", "test.log", "test.log", "test.log"],
				removeds: ["1-test.log", "2-test.log", "3-test.log"],
				rotated:  ["1-test.log", "2-test.log", "3-test.log", "4-test.log", "1-test.log"],
				rotation: 5,
				write:    1,
				writev:   1
			}));
		it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
		it("first rotated file content", () => eq(readFileSync("4-test.log", "utf8"), "test\ntest\ntest\ntest\ntest\n"));
		it("second rotated file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\ntest\ntest\ntest\ntest\n"));
	});

	describe("error reading history file", () => {
		const events = test({ options: { maxSize: "60B", size: "10B" } }, rfs => {
			rfs.fsReadFile = (path: string, encoding: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${path} ${encoding}`)));
			rfs.write("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test test.log.txt utf8"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error writing history file", () => {
		const events = test({ options: { maxSize: "60B", size: "10B" } }, rfs => {
			rfs.fsWriteFile = (path: string, data: string, encoding: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${path} ${data} ${encoding}`)));
			rfs.write("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test test.log.txt 1-test.log\n utf8"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error checking rotated file", () => {
		const events = test({ options: { maxSize: "60B", size: "10B" } }, rfs => {
			const prev = rfs.history;
			rfs.history = (filename: string, callback: (error: Error) => void): void => {
				rfs.fsStat = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${path}`)));
				prev.bind(rfs, filename, callback)();
			};
			rfs.write("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test 1-test.log"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error removing rotated file (size)", () => {
		const events = test({ options: { maxSize: "50B", size: "10B" } }, rfs => {
			const prev = rfs.historyRemove;
			rfs.historyRemove = (files: any, size: boolean, callback: (error: Error) => void): void => {
				rfs.fsUnlink = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${files.map((e: any) => e.name).join(", ")} ${size}`)));
				prev.bind(rfs, files, size, callback)();
			};
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
		});

		it("events", () =>
			deq(events, {
				close:    1,
				error:    ["test 2-test.log, 3-test.log true"],
				finish:   1,
				history:  2,
				open:     ["test.log", "test.log", "test.log"],
				rotation: 3,
				rotated:  ["1-test.log", "2-test.log"],
				write:    1,
				writev:   1
			}));
	});

	describe("error removing rotated file (files)", () => {
		const events = test({ options: { maxFiles: 2, size: "10B" } }, rfs => {
			const prev = rfs.historyRemove;
			rfs.historyRemove = (files: any, size: boolean, callback: (error: Error) => void): void => {
				rfs.fsUnlink = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(`test ${files.map((e: any) => e.name).join(", ")} ${size}`)));
				prev.bind(rfs, files, size, callback)();
			};
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
		});

		it("events", () =>
			deq(events, {
				close:    1,
				error:    ["test 2-test.log, 3-test.log false"],
				finish:   1,
				history:  2,
				open:     ["test.log", "test.log", "test.log"],
				rotation: 3,
				rotated:  ["1-test.log", "2-test.log"],
				write:    1,
				writev:   1
			}));
	});

	describe("immutable", () => {
		let min = 0;
		const events = test({ filename: "test.log", options: { immutable: true, interval: "1d", maxFiles: 2, size: "10B" } }, rfs => {
			rfs.now = (): Date => new Date(2015, 0, 23, 1, ++min, 23, 123);
			rfs.write("test\ntest\n");
			rfs.write("test\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\n");
			rfs.write("test\ntest\ntest\ntest\ntest\n");
			rfs.end("test\n");
		});

		it("events", () =>
			deq(events, {
				finish:   1,
				history:  4,
				open:     ["20150123-0101-01-test.log", "20150123-0105-01-test.log", "20150123-0109-01-test.log", "20150123-0113-01-test.log", "20150123-0117-01-test.log"],
				removedn: ["20150123-0101-01-test.log", "20150123-0105-01-test.log"],
				rotated:  ["20150123-0101-01-test.log", "20150123-0105-01-test.log", "20150123-0109-01-test.log", "20150123-0113-01-test.log"],
				rotation: 4,
				write:    1,
				writev:   1
			}));
		it("file content", () => eq(readFileSync("20150123-0117-01-test.log", "utf8"), "test\n"));
		it("first rotated file content", () => eq(readFileSync("20150123-0109-01-test.log", "utf8"), "test\ntest\ntest\ntest\n"));
		it("second rotated file content", () => eq(readFileSync("20150123-0113-01-test.log", "utf8"), "test\ntest\ntest\ntest\ntest\n"));
	});
});
