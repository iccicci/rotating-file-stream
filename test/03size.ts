"use strict";

import { deepStrictEqual as deq, strictEqual as eq } from "assert";
import { readFileSync } from "fs";
import { sep } from "path";
import { test } from "./helper";

describe("size", () => {
	describe("initial rotation", () => {
		const events = test({ files: { "test.log": "test\ntest\n" }, options: { size: "10B" } }, rfs => rfs.end("test\n"));

		it("events", () => deq(events, { finish: 1, open: ["test.log"], rotated: ["1-test.log"], rotation: 1, write: 1 }));
		it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
		it("rotated file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\n"));
	});

	describe("single write rotation by size", () => {
		const events = test({ files: { "test.log": "test\n" }, options: { size: "10B" } }, rfs => rfs.end("test\n"));

		it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["1-test.log"], rotation: 1, write: 1 }));
		it("file content", () => eq(readFileSync("test.log", "utf8"), ""));
		it("rotated file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\n"));
	});

	describe("multi write rotation by size", () => {
		const events = test({ options: { size: "10B" } }, rfs => {
			rfs.write("test\n");
			rfs.write("test\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["1-test.log"], rotation: 1, write: 1, writev: 1 }));
		it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
		it("rotated file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\n"));
	});

	describe("one write one file", () => {
		const events = test({ files: { "test.log": "test\n" }, options: { size: "15B" } }, rfs => {
			rfs.write("test\n");
			rfs.write("test\ntest\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["1-test.log"], rotation: 1, write: 1, writev: 1 }));
		it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
		it("rotated file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\ntest\ntest\n"));
	});

	describe("missing path creation", function() {
		const filename = `log${sep}t${sep}test.log`;
		const rotated = `log${sep}t${sep}t${sep}test.log`;
		const events = test({ filename: (time: Date): string => (time ? rotated : filename), options: { size: "10B" } }, rfs => {
			rfs.write("test\n");
			rfs.write("test\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { finish: 1, open: [filename, filename], rotated: [rotated], rotation: 1, write: 1, writev: 1 }));
		it("file content", () => eq(readFileSync(filename, "utf8"), "test\n"));
		it("rotated file content", () => eq(readFileSync(rotated, "utf8"), "test\ntest\n"));
	});
});
