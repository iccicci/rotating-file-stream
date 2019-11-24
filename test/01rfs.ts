"use strict";

process.env.TZ = "Europe/Rome";

import { RotatingFileStream, createStream } from "..";
import { strictEqual as eq, throws as ex } from "assert";
import { Writable } from "stream";

describe("rfs", () => {
	describe("new", () => {
		let rfs: any;

		before(done => {
			rfs = createStream("test.log", { mode: parseInt("666", 8) });
			rfs.end(done);
		});

		it("RFS", () => eq(rfs instanceof RotatingFileStream, true));
		it("Writable", () => eq(rfs instanceof Writable, true));
		it("std filename generator first time", () => eq(rfs.generator(null), "test.log"));
		it("std filename generator later times", () => eq(rfs.generator(new Date("1976-01-23 14:45"), 4), "19760123-1445-04-test.log"));
	});

	describe("no options", () => {
		before(done => createStream("test.log").end(done));

		it("no error", () => eq(true, true));
	});

	describe("wrong calls", () => {
		const encodingError = RangeError("The \"test\" encoding is not supported");

		if(Number(process.version.match(/^v(\d+)/)[1]) < 11) encodingError.name = "RangeError [ERR_ENCODING_NOT_SUPPORTED]";

		it("wrong filename type", () => ex(() => createStream({} as string), Error("The \"filename\" argument must be one of type string or function. Received type object")));
		it("wrong options type", () => ex(() => createStream("test.log", "test.log" as unknown), Error("The \"options\" argument must be of type object. Received type string")));
		it("unknown option", () => ex(() => createStream("test.log", { test: true } as any), Error("Unknown option: test")));
		it("no compress value", () => ex(() => createStream("test.log", { compress: false }), Error("A value for 'options.compress' must be specified")));
		it("wrong compress type", () => ex(() => createStream("test.log", { compress: 23 } as any), Error("Don't know how to handle 'options.compress' type: number")));
		it("wrong compress method", () => ex(() => createStream("test.log", { compress: "test" }), Error("Don't know how to handle compression method: test")));
		it("wrong interval type", () => ex(() => createStream("test.log", { interval: 23 } as any), Error("Don't know how to handle 'options.interval' type: number")));
		it("wrong path type", () => ex(() => createStream("test.log", { path: 23 } as any), Error("Don't know how to handle 'options.path' type: number")));
		it("wrong size type", () => ex(() => createStream("test.log", { size: 23 } as any), Error("Don't know how to handle 'options.size' type: number")));
		it("wrong size type", () => ex(() => createStream("test.log", { size: "test" }), Error("Unknown 'options.size' format: test")));
		it("wrong size number", () => ex(() => createStream("test.log", { size: "-23B" }), Error("A positive integer number is expected for 'options.size'")));
		it("missing size unit", () => ex(() => createStream("test.log", { size: "23" }), Error("Missing unit for 'options.size'")));
		it("wrong size unit", () => ex(() => createStream("test.log", { size: "23test" }), Error("Unknown 'options.size' unit: t")));
		it("wrong interval seconds number", () => ex(() => createStream("test.log", { interval: "23s" }), Error("An integer divider of 60 is expected as seconds for 'options.interval'")));
		it("wrong interval minutes number", () => ex(() => createStream("test.log", { interval: "23m" }), Error("An integer divider of 60 is expected as minutes for 'options.interval'")));
		it("wrong interval hours number", () => ex(() => createStream("test.log", { interval: "23h" }), Error("An integer divider of 24 is expected as hours for 'options.interval'")));
		it("string rotate value", () => ex(() => createStream("test.log", { rotate: "test" } as any), Error("'rotate' option must be a positive integer number")));
		it("negative rotate value", () => ex(() => createStream("test.log", { rotate: -23 }), Error("'rotate' option must be a positive integer number")));
		it("wrong history", () => ex(() => createStream("test.log", { history: {} } as any), Error("Don't know how to handle 'options.history' type: object")));
		it("wrong maxFiles", () => ex(() => createStream("test.log", { maxFiles: {} } as any), Error("'maxFiles' option must be a positive integer number")));
		it("negative maxFiles", () => ex(() => createStream("test.log", { maxFiles: -23 }), Error("'maxFiles' option must be a positive integer number")));
		it("wrong maxSize", () => ex(() => createStream("test.log", { maxSize: "-23B" }), Error("A positive integer number is expected for 'options.size'")));
		it("wrong encoding", () => ex(() => createStream("test.log", { encoding: "test" }), encodingError));
	});
});
