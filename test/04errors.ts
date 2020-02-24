"use strict";

import { close, mkdir, readFileSync } from "fs";
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
				filename: (time: Date) => {
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
				filename: (time: Date) => {
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

	describe("error while write", () => {
		const events = test({ options: { interval: "10d" } }, rfs =>
			rfs.once("open", () => {
				rfs.stream.write = (buffer: string, encoding: string, callback: any): void => {
					process.nextTick(() => callback(new Error(encoding + buffer)));
				};
				rfs.write("test\n");
			})
		);

		it("events", () => deq(events, { close: 1, error: ["buffertest\n"], finish: 1, open: ["test.log"], write: 1 }));
	});

	describe("error while rename", () => {
		const events = test({ options: { size: "5B" } }, rfs => {
			rfs.fsRename = (a: string, b: string, callback: any): void => process.nextTick(() => callback(new Error(a + b)));
			rfs.once("open", () => rfs.write("test\n"));
		});

		it("events", () => deq(events, { close: 1, error: ["test.log1-test.log"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error creating missing path (first open)", () => {
		const filename = `log${sep}t${sep}test.log`;
		const rotated = `log${sep}t${sep}t${sep}test.log`;
		const events = test({ filename: (time: Date): string => (time ? rotated : filename), options: { size: "10B" } }, rfs => {
			rfs.fsMkdir = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error("test " + path)));
			rfs.write("test\n");
			rfs.write("test\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { close: 1, error: [`test log${sep}t`], finish: 1, write: 1 }));
	});

	describe("error creating missing path (rotation)", () => {
		const filename = `log${sep}t${sep}test.log`;
		const rotated = `log${sep}t${sep}t${sep}test.log`;
		const events = test({ filename: (time: Date): string => (time ? rotated : filename), options: { size: "10B" } }, rfs => {
			rfs.on("rotation", () => (rfs.fsMkdir = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error("test " + path)))));
			rfs.write("test\n");
			rfs.write("test\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { close: 1, error: [`test log${sep}t${sep}t`], finish: 1, open: [filename], rotation: 1, write: 1, writev: 1 }));
	});

	describe("error creating second missing path", () => {
		const filename = `log${sep}t${sep}test.log`;
		const rotated = `log${sep}t${sep}t${sep}test.log`;
		const events = test({ filename: (time: Date): string => (time ? rotated : filename), options: { size: "10B" } }, rfs => {
			let first = true;
			rfs.fsMkdir = (path: string, callback: (error: Error) => void): void => {
				if(first) {
					first = false;
					return mkdir(path, callback);
				}
				process.nextTick(() => callback(new Error("test " + path)));
			};
			rfs.write("test\n");
			rfs.write("test\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test log"], finish: 1, write: 1 }));
	});

	describe("error on no rotated file open", () => {
		const filename = `log${sep}t${sep}test.log`;
		const rotated = `log${sep}t${sep}t${sep}test.log`;
		const events = test({ filename: (time: Date): string => (time ? rotated : filename), options: { size: "10B" } }, rfs => {
			rfs.fsCreateWriteStream = (): any => ({
				end:  (): void => {},
				once: (event: string, callback: (error: any) => void): any => (event === "error" ? setTimeout(() => callback({ code: "TEST" }), 50) : null)
			});
			rfs.write("test\n");
		});

		it("events", () => deq(events, { close: 1, error: ["TEST"], finish: 1, write: 1 }));
	});

	describe("async error in sub stream", () => {
		const events = test({ options: { size: "15B" } }, rfs =>
			rfs.once("open", () => {
				rfs.stream.emit("error", new Error("test"));
				rfs.write("test\n");
			})
		);

		it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], write: 1 }));
	});

	describe("error opening touched file", () => {
		const events = test({ filename: "log/test.log", options: { size: "10B" } }, rfs => {
			rfs.fsOpen = (path: string, flags: string, mode: number, callback: (error: any, fd?: number) => void): void =>
				process.nextTick(() => callback({ code: "ENOENT", message: `${path} ${flags} ${mode}` }));
			rfs.write("test\n");
			rfs.write("test\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { close: 1, error: ["ENOENT"], finish: 1, open: ["log/test.log"], rotation: 1, write: 1, writev: 1 }));
	});

	describe("error closing touched file", () => {
		const events = test({ options: { size: "10B" } }, rfs => {
			rfs.fsClose = (fd: number, callback: (error: Error) => void): void => close(fd, () => callback(new Error("test")));
			rfs.write("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error unlinking file", () => {
		const events = test({ options: { size: "10B" } }, rfs => {
			rfs.fsUnlink = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error("test " + path)));
			rfs.write("test\n");
			rfs.write("test\n");
			rfs.end("test\n");
		});

		it("events", () => deq(events, { finish: 1, open: ["test.log", "test.log"], rotated: ["1-test.log"], rotation: 1, warning: ["test 1-test.log"], write: 1, writev: 1 }));
		it("file content", () => eq(readFileSync("test.log", "utf8"), "test\n"));
		it("rotated file content", () => eq(readFileSync("1-test.log", "utf8"), "test\ntest\n"));
	});

	describe("error in external compression function", () => {
		const events = test(
			{
				options: {
					compress: (): string => {
						throw new Error("test");
					},
					rotate: 2,
					size:   "10B"
				}
			},
			rfs => rfs.write("test\ntest\n")
		);

		it("events", () => deq(events, { close: 1, error: ["test"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error in stat (immutable)", () => {
		const events = test({ options: { immutable: true, interval: "1d", size: "5B" } }, rfs => {
			rfs.fsStat = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error("test " + path)));
			rfs.write("test\ntest\n");
		});

		it("events", () => deq(events, { close: 1, error: ["test 1-test.log"], finish: 1, write: 1 }));
	});

	describe("immutable exhausted", () => {
		const events = test({ filename: () => "test.log", options: { immutable: true, interval: "1d", size: "5B" } }, rfs => rfs.write("test\n"));

		it("events", () => deq(events, { close: 1, error: ["RFS-TOO-MANY"], finish: 1, open: ["test.log"], rotation: 1, write: 1 }));
	});

	describe("error in write stat", () => {
		const events = test({ options: { size: "10B" } }, rfs =>
			rfs.once("open", () => {
				rfs.fsStat = (path: string, callback: (error: Error) => void): void => process.nextTick(() => callback(new Error(path + "test")));
				rfs.write("test\n");
			})
		);

		it("events", () => deq(events, { close: 1, error: ["test.logtest"], finish: 1, open: ["test.log"], write: 1 }));
	});

	describe("RO error", () => {
		const events = test({ files: { "test.log": { content: "test\n", mode: 0o400 } }, options: { size: "10B" } }, rfs => {
			rfs.write("test\n");
		});

		it("events", () => deq(events, { close: 1, error: ["EACCES"], finish: 1, write: 1 }));
	});
});
