"use strict";

import { ChildProcess, exec } from "child_process";
import { Gzip, createGzip } from "zlib";
import { Readable, Writable } from "stream";
import { Stats, close, createReadStream, createWriteStream, mkdir, open, readFile, rename, stat, unlink, write, writeFile } from "fs";
import { parse, sep } from "path";
import { TextDecoder } from "util";
import { setTimeout } from "timers";

class RotatingFileStreamError extends Error {
	public code: string;

	constructor() {
		super("Too many destination file attempts");

		this.code = "RFS-TOO-MANY";
	}
}

export type Compressor = (source: string, dest: string) => string;
export type Generator = (time: number | Date, index?: number) => string;

export interface Options {
	compress?: boolean | string | Compressor;
	encoding?: BufferEncoding;
	history?: string;
	immutable?: boolean;
	initialRotation?: boolean;
	interval?: string;
	intervalBoundary?: boolean;
	maxFiles?: number;
	maxSize?: string;
	mode?: number;
	path?: string;
	rotate?: number;
	size?: string;
	teeToStdout?: boolean;
}

interface Opts {
	compress?: string | Compressor;
	encoding?: BufferEncoding;
	history?: string;
	immutable?: boolean;
	initialRotation?: boolean;
	interval?: { num: number; unit: string };
	intervalBoundary?: boolean;
	maxFiles?: number;
	maxSize?: number;
	mode?: number;
	path?: string;
	rotate?: number;
	size?: number;
	teeToStdout?: boolean;
}

type Callback = (error?: Error) => void;

interface Chunk {
	chunk: Buffer;
	encoding: BufferEncoding;
	next: Chunk;
}

interface History {
	name: string;
	size: number;
	time: number;
}

export class RotatingFileStream extends Writable {
	private createGzip: () => Gzip;
	private destroyer: () => void;
	private error: Error;
	private exec: (command: string, callback?: (error: Error) => void) => ChildProcess;
	private filename: string;
	private finished: boolean;
	private fsClose: (fd: number, callback: Callback) => void;
	private fsCreateReadStream: (path: string, options: { flags?: string; mode?: number }) => Readable;
	private fsCreateWriteStream: (path: string, options: { flags?: string; mode?: number }) => Writable;
	private fsMkdir: (path: string, callback: Callback) => void;
	private fsOpen: (path: string, flags: string, mode: number, callback: (error: NodeJS.ErrnoException, fd: number) => void) => void;
	private fsReadFile: (path: string, encoding: string, callback: (error: NodeJS.ErrnoException, data: string) => void) => void;
	private fsRename: (oldPath: string, newPath: string, callback: (error: NodeJS.ErrnoException) => void) => void;
	private fsStat: (path: string, callback: (error: NodeJS.ErrnoException, stats: Stats) => void) => void;
	private fsUnlink: (path: string, callback: Callback) => void;
	private fsWrite: (fd: number, data: string, encoding: string, callback: Callback) => void;
	private fsWriteFile: (path: string, data: string, encoding: string, callback: Callback) => void;
	private generator: Generator;
	private last: string;
	private maxTimeout: number;
	private next: number;
	private opened: () => void;
	private options: Opts;
	private prev: number;
	private rotatedName: string;
	private rotation: Date;
	private size: number;
	private stream: Writable;
	private timer: NodeJS.Timeout;

	constructor(generator: Generator, options: Opts) {
		const { encoding, history, maxFiles, maxSize, path } = options;

		super({ decodeStrings: true, defaultEncoding: encoding });

		this.createGzip = createGzip;
		this.exec = exec;
		this.filename = path + generator(null);
		this.fsClose = close;
		this.fsCreateReadStream = createReadStream;
		this.fsCreateWriteStream = createWriteStream;
		this.fsMkdir = mkdir;
		this.fsOpen = open;
		this.fsReadFile = readFile;
		this.fsRename = rename;
		this.fsStat = stat;
		this.fsUnlink = unlink;
		this.fsWrite = (write as unknown) as (fd: number, data: string, encoding: string, callback: Callback) => void;
		this.fsWriteFile = writeFile;
		this.generator = generator;
		this.maxTimeout = 2147483640;
		this.options = options;

		if(maxFiles || maxSize) options.history = path + (history ? history : this.generator(null) + ".txt");

		this.on("close", () => (this.finished ? null : this.emit("finish")));
		this.on("finish", () => (this.finished = this.clear()));

		process.nextTick(() =>
			this.init(error => {
				this.error = error;
				if(this.opened) this.opened();
			})
		);
	}

	_destroy(error: Error, callback: Callback): void {
		const destroyer = (): void => {
			this.clear();
			this.reclose(() => {});
		};

		if(this.stream) destroyer();
		else this.destroyer = destroyer;

		callback(error);
	}

	_final(callback: Callback): void {
		if(this.stream) return this.stream.end(callback);
		callback();
	}

	_write(chunk: Buffer, encoding: BufferEncoding, callback: Callback): void {
		this.rewrite({ chunk, encoding, next: null }, callback);
	}

	_writev(chunks: Chunk[], callback: Callback): void {
		this.rewrite(chunks[0], callback);
	}

	private rewrite(chunk: Chunk, callback: Callback): void {
		const destroy = (error: Error): void => {
			this.destroy();

			return callback(error);
		};

		const rewrite = (): void => {
			if(this.destroyed) return callback(this.error);
			if(this.error) return destroy(this.error);

			if(! this.stream) {
				this.opened = rewrite;
				return;
			}

			const done: Callback = (error?: Error): void => {
				if(error) return destroy(error);
				if(chunk.next) return this.rewrite(chunk.next, callback);
				callback();
			};

			this.size += chunk.chunk.length;
			this.stream.write(chunk.chunk, chunk.encoding, (error: Error): void => {
				if(error) return done(error);
				if(this.options.size && this.size >= this.options.size) return this.rotate(done);
				done();
			});

			if(this.options.teeToStdout && ! process.stdout.destroyed) process.stdout.write(chunk.chunk, chunk.encoding);
		};

		if(this.stream) {
			return this.fsStat(this.filename, (error: NodeJS.ErrnoException): void => {
				if(! error) return rewrite();
				if(error.code !== "ENOENT") return destroy(error);

				this.reclose(() => this.reopen(false, 0, () => rewrite()));
			});
		}

		this.opened = rewrite;
	}

	private init(callback: Callback): void {
		const { immutable, initialRotation, interval, size } = this.options;

		if(immutable) return this.immutate(true, callback);

		this.fsStat(this.filename, (error, stats) => {
			if(error) return error.code === "ENOENT" ? this.reopen(false, 0, callback) : callback(error);

			if(! stats.isFile()) return callback(new Error(`Can't write on: ${this.filename} (it is not a file)`));

			if(initialRotation) {
				this.intervalBounds(this.now());
				const prev = this.prev;
				this.intervalBounds(new Date(stats.mtime.getTime()));

				if(prev !== this.prev) return this.rotate(callback);
			}

			this.size = stats.size;

			if(! size || stats.size < size) return this.reopen(false, stats.size, callback);

			if(interval) this.intervalBounds(this.now());

			this.rotate(callback);
		});
	}

	private makePath(name: string, callback: Callback): void {
		const dir = parse(name).dir;

		this.fsMkdir(dir, (error: NodeJS.ErrnoException): void => {
			if(error) {
				if(error.code === "ENOENT") return this.makePath(dir, (error: Error): void => (error ? callback(error) : this.makePath(name, callback)));
				return callback(error);
			}

			callback();
		});
	}

	private reopen(retry: boolean, size: number, callback: Callback): void {
		const options: any = { flags: "a" };

		if("mode" in this.options) options.mode = this.options.mode;

		let called: boolean;
		const stream = this.fsCreateWriteStream(this.filename, options);

		const end: Callback = (error?: Error): void => {
			if(called) {
				this.error = error;
				return;
			}

			called = true;
			this.stream = stream;

			if(this.opened) {
				process.nextTick(this.opened);
				this.opened = null;
			}

			if(this.destroyer) process.nextTick(this.destroyer);

			callback(error);
		};

		stream.once("open", () => {
			this.size = size;
			end();
			this.interval();
			this.emit("open", this.filename);
		});

		stream.once("error", (error: NodeJS.ErrnoException) =>
			error.code !== "ENOENT" || retry ? end(error) : this.makePath(this.filename, (error: Error): void => (error ? end(error) : this.reopen(true, size, callback)))
		);
	}

	private reclose(callback: Callback): void {
		const { stream } = this;

		if(! stream) return callback();

		this.stream = null;
		stream.once("finish", callback);
		stream.end();
	}

	private now(): Date {
		return new Date();
	}

	private rotate(callback: Callback): void {
		const { immutable, rotate } = this.options;

		this.size = 0;
		this.rotation = this.now();

		this.clear();
		this.reclose(() => (rotate ? this.classical(rotate, callback) : immutable ? this.immutate(false, callback) : this.move(callback)));
		this.emit("rotation");
	}

	private findName(tmp: boolean, callback: (error: Error, filename?: string) => void, index?: number): void {
		if(! index) index = 1;

		const { interval, path, intervalBoundary } = this.options;
		let filename = `${this.filename}.${index}.rfs.tmp`;

		if(index >= 1000) return callback(new RotatingFileStreamError());

		if(! tmp) {
			try {
				filename = path + this.generator(interval && intervalBoundary ? new Date(this.prev) : this.rotation, index);
			} catch(e) {
				return callback(e);
			}
		}

		this.fsStat(filename, error => {
			if(! error || error.code !== "ENOENT") return this.findName(tmp, callback, index + 1);

			callback(null, filename);
		});
	}

	private move(callback: Callback): void {
		const { compress } = this.options;
		let filename: string;

		const open = (error?: Error): void => {
			if(error) return callback(error);

			this.rotated(filename, callback);
		};

		this.findName(false, (error: Error, found: string): void => {
			if(error) return callback(error);

			filename = found;

			this.touch(filename, false, (error: Error): void => {
				if(error) return callback(error);

				if(compress) return this.compress(filename, open);
				this.fsRename(this.filename, filename, open);
			});
		});
	}

	private touch(filename: string, retry: boolean, callback: Callback): void {
		this.fsOpen(filename, "a", parseInt("666", 8), (error: NodeJS.ErrnoException, fd: number) => {
			if(error) {
				if(error.code !== "ENOENT" || retry) return callback(error);

				return this.makePath(filename, error => {
					if(error) return callback(error);

					this.touch(filename, true, callback);
				});
			}

			return this.fsClose(fd, (error: Error): void => {
				if(error) return callback(error);

				this.fsUnlink(filename, (error: Error): void => {
					if(error) this.emit("warning", error);
					callback();
				});
			});
		});
	}

	private classical(count: number, callback: Callback): void {
		const { compress, path, rotate } = this.options;
		let prevName: string;
		let thisName: string;

		if(rotate === count) delete this.rotatedName;

		const open = (error?: Error): void => {
			if(error) return callback(error);

			this.rotated(this.rotatedName, callback);
		};

		try {
			prevName = count === 1 ? this.filename : path + this.generator(count - 1);
			thisName = path + this.generator(count);
		} catch(e) {
			return callback(e);
		}

		const next = count === 1 ? open : (): void => this.classical(count - 1, callback);

		const move = (): void => {
			if(count === 1 && compress) return this.compress(thisName, open);

			this.fsRename(prevName, thisName, (error: NodeJS.ErrnoException): void => {
				if(! error) return next();

				if(error.code !== "ENOENT") return callback(error);

				this.makePath(thisName, (error: Error): void => {
					if(error) return callback(error);

					this.fsRename(prevName, thisName, (error: Error): void => (error ? callback(error) : next()));
				});
			});
		};

		this.fsStat(prevName, (error: NodeJS.ErrnoException): void => {
			if(error) {
				if(error.code !== "ENOENT") return callback(error);

				return next();
			}

			if(! this.rotatedName) this.rotatedName = thisName;

			move();
		});
	}

	private clear(): boolean {
		if(this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		return true;
	}

	private intervalBoundsBig(now: Date): void {
		let year = now.getFullYear();
		let month = now.getMonth();
		let day = now.getDate();
		let hours = now.getHours();
		const { num, unit } = this.options.interval;

		if(unit === "M") {
			day = 1;
			hours = 0;
		} else if(unit === "d") hours = 0;
		else hours = parseInt(((hours / num) as unknown) as string, 10) * num;

		this.prev = new Date(year, month, day, hours, 0, 0, 0).getTime();

		if(unit === "M") month += num;
		else if(unit === "d") day += num;
		else hours += num;

		this.next = new Date(year, month, day, hours, 0, 0, 0).getTime();
	}

	private intervalBounds(now: Date): Date {
		const unit = this.options.interval.unit;

		if(unit === "M" || unit === "d" || unit === "h") this.intervalBoundsBig(now);
		else {
			let period = 1000 * this.options.interval.num;

			if(unit === "m") period *= 60;

			this.prev = parseInt(((now.getTime() / period) as unknown) as string, 10) * period;
			this.next = this.prev + period;
		}

		return new Date(this.prev);
	}

	private interval(): void {
		if(! this.options.interval) return;

		this.intervalBounds(this.now());

		const set = (): void => {
			const time = this.next - this.now().getTime();

			if(time <= 0) return this.rotate(error => (this.error = error));

			this.timer = setTimeout(set, time > this.maxTimeout ? this.maxTimeout : time);
			this.timer.unref();
		};

		set();
	}

	private compress(filename: string, callback: Callback): void {
		const { compress } = this.options;

		const done = (error?: Error): void => {
			if(error) return callback(error);

			this.fsUnlink(this.filename, callback);
		};

		if(typeof compress === "function") this.external(filename, done);
		else this.gzip(filename, done);
	}

	private external(filename: string, callback: Callback): void {
		const compress: Compressor = this.options.compress as Compressor;
		let cont: string;

		try {
			cont = compress(this.filename, filename);
		} catch(e) {
			return callback(e);
		}

		this.findName(true, (error: Error, found: string): void => {
			if(error) return callback(error);

			this.fsOpen(found, "w", 0o777, (error: Error, fd: number): void => {
				if(error) return callback(error);

				const unlink = (error: Error): void => {
					this.fsUnlink(found, (error2: Error): void => {
						if(error2) this.emit("warning", error2);

						callback(error);
					});
				};

				this.fsWrite(fd, cont, "utf8", (error: Error): void => {
					this.fsClose(fd, (error2: Error): void => {
						if(error) {
							if(error2) this.emit("warning", error2);

							return unlink(error);
						}

						if(error2) return unlink(error2);

						if(found.indexOf(sep) === -1) found = `.${sep}${found}`;

						this.exec(`sh "${found}"`, unlink);
					});
				});
			});
		});
	}

	private gzip(filename: string, callback: Callback): void {
		const { mode } = this.options;
		const options = mode ? { mode } : {};
		const inp = this.fsCreateReadStream(this.filename, {});
		const out = this.fsCreateWriteStream(filename, options);
		const zip = this.createGzip();

		[inp, out, zip].map(stream => stream.once("error", callback));
		out.once("finish", callback);

		inp.pipe(zip).pipe(out);
	}

	private rotated(filename: string, callback: Callback): void {
		const { maxFiles, maxSize } = this.options;

		const open = (error?: Error): void => {
			if(error) return callback(error);

			this.reopen(false, 0, callback);
			this.emit("rotated", filename);
		};

		if(maxFiles || maxSize) return this.history(filename, open);
		open();
	}

	private history(filename: string, callback: Callback): void {
		let { history } = this.options;

		this.fsReadFile(history, "utf8", (error: NodeJS.ErrnoException, data: string): void => {
			if(error) {
				if(error.code !== "ENOENT") return callback(error);

				return this.historyGather([filename], 0, [], callback);
			}

			const files = data.split("\n");

			files.push(filename);
			this.historyGather(files, 0, [], callback);
		});
	}

	private historyGather(files: string[], index: number, res: History[], callback: Callback): void {
		if(index === files.length) return this.historyCheckFiles(res, callback);

		this.fsStat(files[index], (error: NodeJS.ErrnoException, stats: Stats): void => {
			if(error) {
				if(error.code !== "ENOENT") return callback(error);
			} else if(stats.isFile()) {
				res.push({
					name: files[index],
					size: stats.size,
					time: stats.ctime.getTime()
				});
			} else this.emit("warning", new Error(`File '${files[index]}' contained in history is not a regular file`));

			this.historyGather(files, index + 1, res, callback);
		});
	}

	private historyRemove(files: History[], size: boolean, callback: Callback): void {
		const file = files.shift();

		this.fsUnlink(file.name, (error: NodeJS.ErrnoException): void => {
			if(error) return callback(error);

			this.emit("removed", file.name, ! size);
			callback();
		});
	}

	private historyCheckFiles(files: History[], callback: Callback): void {
		const { maxFiles } = this.options;

		files.sort((a, b) => a.time - b.time);

		if(! maxFiles || files.length <= maxFiles) return this.historyCheckSize(files, callback);

		this.historyRemove(files, false, (error: Error): void => (error ? callback(error) : this.historyCheckFiles(files, callback)));
	}

	private historyCheckSize(files: History[], callback: Callback): void {
		const { maxSize } = this.options;
		let size = 0;

		if(! maxSize) return this.historyWrite(files, callback);

		files.map(e => (size += e.size));

		if(size <= maxSize) return this.historyWrite(files, callback);

		this.historyRemove(files, true, (error: Error): void => (error ? callback(error) : this.historyCheckSize(files, callback)));
	}

	private historyWrite(files: History[], callback: Callback): void {
		this.fsWriteFile(this.options.history, files.map(e => e.name).join("\n") + "\n", "utf8", (error: NodeJS.ErrnoException): void => {
			if(error) return callback(error);

			this.emit("history");
			callback();
		});
	}

	private immutate(first: boolean, callback: Callback, index?: number, now?: Date): void {
		if(! index) {
			index = 1;
			now = this.now();
		}

		if(index >= 1001) return callback(new RotatingFileStreamError());

		try {
			this.filename = this.options.path + this.generator(now, index);
		} catch(e) {
			return callback(e);
		}

		const open = (size: number, callback: Callback): void => {
			if(first) {
				this.last = this.filename;
				return this.reopen(false, size, callback);
			}

			this.rotated(this.last, (error: Error): void => {
				this.last = this.filename;
				callback(error);
			});
		};

		this.fsStat(this.filename, (error: NodeJS.ErrnoException, stats: Stats): void => {
			const { size } = this.options;

			if(error) {
				if(error.code === "ENOENT") return open(0, callback);

				return callback(error);
			}

			if(! stats.isFile()) return callback(new Error(`Can't write on: '${this.filename}' (it is not a file)`));

			if(size && stats.size >= size) return this.immutate(first, callback, index + 1, now);

			open(stats.size, callback);
		});
	}
}

function buildNumberCheck(field: string): (type: string, options: Options, value: string) => void {
	return (type: string, options: Options, value: string): void => {
		const converted: number = parseInt(value, 10);

		if(type !== "number" || (converted as unknown) !== value || converted <= 0) throw new Error(`'${field}' option must be a positive integer number`);
	};
}

function buildStringCheck(field: string, check: (value: string) => any) {
	return (type: string, options: Options, value: string): void => {
		if(type !== "string") throw new Error(`Don't know how to handle 'options.${field}' type: ${type}`);

		options[field] = check(value);
	};
}

function checkMeasure(value: string, what: string, units: any): any {
	const ret: any = {};

	ret.num = parseInt(value, 10);

	if(isNaN(ret.num)) throw new Error(`Unknown 'options.${what}' format: ${value}`);
	if(ret.num <= 0) throw new Error(`A positive integer number is expected for 'options.${what}'`);

	ret.unit = value.replace(/^[ 0]*/g, "").substr((ret.num + "").length, 1);

	if(ret.unit.length === 0) throw new Error(`Missing unit for 'options.${what}'`);
	if(! units[ret.unit]) throw new Error(`Unknown 'options.${what}' unit: ${ret.unit}`);

	return ret;
}

const intervalUnits: any = {
	M: true,
	d: true,
	h: true,
	m: true,
	s: true
};

function checkIntervalUnit(ret: any, unit: string, amount: number): void {
	if(parseInt(((amount / ret.num) as unknown) as string, 10) * ret.num !== amount) throw new Error(`An integer divider of ${amount} is expected as ${unit} for 'options.interval'`);
}

function checkInterval(value: string): any {
	const ret = checkMeasure(value, "interval", intervalUnits);

	switch(ret.unit) {
	case "h":
		checkIntervalUnit(ret, "hours", 24);
		break;

	case "m":
		checkIntervalUnit(ret, "minutes", 60);
		break;

	case "s":
		checkIntervalUnit(ret, "seconds", 60);
		break;
	}

	return ret;
}

const sizeUnits: any = {
	B: true,
	G: true,
	K: true,
	M: true
};

function checkSize(value: string): any {
	const ret = checkMeasure(value, "size", sizeUnits);

	if(ret.unit === "K") return ret.num * 1024;
	if(ret.unit === "M") return ret.num * 1048576;
	if(ret.unit === "G") return ret.num * 1073741824;

	return ret.num;
}

const checks: any = {
	compress: (type: string, options: Opts, value: boolean | string | Compressor): any => {
		if(! value) throw new Error("A value for 'options.compress' must be specified");
		if(type === "boolean") return (options.compress = (source: string, dest: string): string => `cat ${source} | gzip -c9 > ${dest}`);
		if(type === "function") return;
		if(type !== "string") throw new Error(`Don't know how to handle 'options.compress' type: ${type}`);
		if(((value as unknown) as string) !== "gzip") throw new Error(`Don't know how to handle compression method: ${value}`);
	},

	encoding: (type: string, options: Opts, value: string): any => new TextDecoder(value),

	history: (type: string): void => {
		if(type !== "string") throw new Error(`Don't know how to handle 'options.history' type: ${type}`);
	},

	immutable: (): void => {},

	initialRotation: (): void => {},

	interval: buildStringCheck("interval", checkInterval),

	intervalBoundary: (): void => {},

	maxFiles: buildNumberCheck("maxFiles"),

	maxSize: buildStringCheck("maxSize", checkSize),

	mode: (): void => {},

	path: (type: string, options: Opts, value: string): void => {
		if(type !== "string") throw new Error(`Don't know how to handle 'options.path' type: ${type}`);
		if(value[value.length - 1] !== sep) options.path = value + sep;
	},

	rotate: buildNumberCheck("rotate"),

	size: buildStringCheck("size", checkSize),

	teeToStdout: (): void => {}
};

function checkOpts(options: Options): Opts {
	const ret: Opts = {};

	for(const opt in options) {
		const value = options[opt];
		const type = typeof value;

		if(! (opt in checks)) throw new Error(`Unknown option: ${opt}`);

		ret[opt] = options[opt];
		checks[opt](type, ret, value);
	}

	if(! ret.path) ret.path = "";

	if(! ret.interval) {
		delete ret.immutable;
		delete ret.initialRotation;
		delete ret.intervalBoundary;
	}

	if(ret.rotate) {
		delete ret.history;
		delete ret.immutable;
		delete ret.maxFiles;
		delete ret.maxSize;
		delete ret.intervalBoundary;
	}

	if(ret.immutable) delete ret.compress;

	if(! ret.intervalBoundary) delete ret.initialRotation;

	return ret;
}

function createClassical(filename: string): Generator {
	return (index: number): string => (index ? `${filename}.${index}` : filename);
}

function createGenerator(filename: string): Generator {
	const pad = (num: number): string => (num > 9 ? "" : "0") + num;

	return (time: Date, index?: number): string => {
		if(! time) return (filename as unknown) as string;

		const month = time.getFullYear() + "" + pad(time.getMonth() + 1);
		const day = pad(time.getDate());
		const hour = pad(time.getHours());
		const minute = pad(time.getMinutes());

		return month + day + "-" + hour + minute + "-" + pad(index) + "-" + filename;
	};
}

export function createStream(filename: string | Generator, options?: Options): RotatingFileStream {
	if(typeof options === "undefined") options = {};
	else if(typeof options !== "object") throw new Error(`The "options" argument must be of type object. Received type ${typeof options}`);

	const opts = checkOpts(options);

	let generator: Generator;

	if(typeof filename === "string") generator = options.rotate ? createClassical(filename) : createGenerator(filename);
	else if(typeof filename === "function") generator = filename;
	else throw new Error(`The "filename" argument must be one of type string or function. Received type ${typeof filename}`);

	return new RotatingFileStream(generator, opts);
}
