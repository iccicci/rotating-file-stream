import { exec } from "child_process";
import { Gzip, createGzip } from "zlib";
import { Readable, Writable } from "stream";
import { Stats, access, constants, createReadStream, createWriteStream } from "fs";
import { FileHandle, mkdir, open, readFile, rename, stat, unlink, writeFile } from "fs/promises";
import { sep } from "path";
import { TextDecoder } from "util";

// Do not remove: https://github.com/iccicci/rotating-file-stream/issues/106
import { setTimeout } from "timers";

async function exists(filename: string): Promise<boolean> {
  return new Promise(resolve => access(filename, constants.F_OK, error => resolve(! error)));
}

export class RotatingFileStreamError extends Error {
  public code = "RFS-TOO-MANY";

  constructor() {
    super("Too many destination file attempts");
  }
}

export type Compressor = (source: string, dest: string) => string;
export type Generator = (time: number | Date, index?: number) => string;

interface RotatingFileStreamEvents {
  // Inherited from Writable
  close: () => void;
  drain: () => void;
  error: (err: Error) => void;
  finish: () => void;
  pipe: (src: Readable) => void;
  unpipe: (src: Readable) => void;

  // RotatingFileStream defined
  external: (stdout: string, stderr: string) => void;
  history: () => void;
  open: (filename: string) => void;
  removed: (filename: string, number: boolean) => void;
  rotation: () => void;
  rotated: (filename: string) => void;
  warning: (error: Error) => void;
}

export declare interface RotatingFileStream extends Writable {
  addListener<Event extends keyof RotatingFileStreamEvents>(event: Event, listener: RotatingFileStreamEvents[Event]): this;
  emit<Event extends keyof RotatingFileStreamEvents>(event: Event, ...args: Parameters<RotatingFileStreamEvents[Event]>): boolean;
  on<Event extends keyof RotatingFileStreamEvents>(event: Event, listener: RotatingFileStreamEvents[Event]): this;
  once<Event extends keyof RotatingFileStreamEvents>(event: Event, listener: RotatingFileStreamEvents[Event]): this;
  prependListener<Event extends keyof RotatingFileStreamEvents>(event: Event, listener: RotatingFileStreamEvents[Event]): this;
  prependOnceListener<Event extends keyof RotatingFileStreamEvents>(event: Event, listener: RotatingFileStreamEvents[Event]): this;
  removeListener<Event extends keyof RotatingFileStreamEvents>(event: Event, listener: RotatingFileStreamEvents[Event]): this;
}

export type IntervalUnit = "M" | "d" | "h" | "m" | "s";
export type Interval = `${number}${IntervalUnit}`;

export type FileSizeUnit = "B" | "K" | "M" | "G";
export type FileSize = `${number}${FileSizeUnit}`;

export interface Options {
  compress?: boolean | "gzip" | Compressor;
  encoding?: BufferEncoding;
  history?: string;
  immutable?: boolean;
  initialRotation?: boolean;
  interval?: Interval;
  intervalBoundary?: boolean;
  intervalUTC?: boolean;
  maxFiles?: number;
  maxSize?: FileSize;
  mode?: number;
  omitExtension?: boolean;
  path?: string;
  rotate?: number;
  size?: FileSize;
  teeToStdout?: boolean;
}

interface Opts {
  compress?: boolean | "gzip" | Compressor;
  encoding?: BufferEncoding;
  history?: string;
  immutable?: boolean;
  initialRotation?: boolean;
  interval?: { num: number; unit: IntervalUnit };
  intervalBoundary?: boolean;
  intervalUTC?: boolean;
  maxFiles?: number;
  maxSize?: number;
  mode?: number;
  omitExtension?: boolean;
  path?: string;
  rotate?: number;
  size?: number;
  teeToStdout?: boolean;
}

type Callback = (error?: Error) => void;

interface Chunk {
  chunk: Buffer;
  encoding: BufferEncoding;
}

interface History {
  name: string;
  size: number;
  time: number;
}

export class RotatingFileStream extends Writable {
  private createGzip: () => Gzip;
  private exec: typeof exec;
  private file: FileHandle | undefined;
  private filename: string;
  private finished: boolean;
  private fsCreateReadStream: typeof createReadStream;
  private fsCreateWriteStream: typeof createWriteStream;
  private fsOpen: typeof open;
  private fsReadFile: typeof readFile;
  private fsStat: typeof stat;
  private fsUnlink: typeof unlink;
  private generator: Generator;
  private initPromise: Promise<void> | null;
  private last: string;
  private maxTimeout: number;
  private next: number;
  private options: Opts;
  private prev: number;
  private rotation: Date;
  private size: number;
  private stdout: typeof process.stdout;
  private timeout: NodeJS.Timeout;
  private timeoutPromise: Promise<void> | null;

  constructor(generator: Generator, options: Opts) {
    const { encoding, history, maxFiles, maxSize, path } = options;

    super({ decodeStrings: true, defaultEncoding: encoding });

    this.createGzip = createGzip;
    this.exec = exec;
    this.filename = path + generator(null);
    this.fsCreateReadStream = createReadStream;
    this.fsCreateWriteStream = createWriteStream;
    this.fsOpen = open;
    this.fsReadFile = readFile;
    this.fsStat = stat;
    this.fsUnlink = unlink;
    this.generator = generator;
    this.maxTimeout = 2147483640;
    this.options = options;
    this.stdout = process.stdout;

    if(maxFiles || maxSize) options.history = path + (history ? history : this.generator(null) + ".txt");

    this.on("close", () => (this.finished ? null : this.emit("finish")));
    this.on("finish", () => (this.finished = this.clear()));

    // In v15 was introduced the _constructor method to delay any _write(), _final() and _destroy() calls
    // Until v16 will be not deprecated we still need this.initPromise
    // https://nodejs.org/api/stream.html#stream_writable_construct_callback

    (async () => {
      try {
        this.initPromise = this.init();

        await this.initPromise;
        delete this.initPromise;
      } catch(e) {}
    })();
  }

  _destroy(error: Error, callback: Callback): void {
    this.refinal(error, callback);
  }

  _final(callback: Callback): void {
    this.refinal(undefined, callback);
  }

  _write(chunk: Buffer, encoding: BufferEncoding, callback: Callback): void {
    this.rewrite([{ chunk, encoding }], 0, callback);
  }

  _writev(chunks: Chunk[], callback: Callback): void {
    this.rewrite(chunks, 0, callback);
  }

  private async refinal(error: Error | undefined, callback: Callback): Promise<void> {
    try {
      this.clear();

      if(this.initPromise) await this.initPromise;
      if(this.timeoutPromise) await this.timeoutPromise;

      await this.reclose();
    } catch(e) {
      return callback(error || e);
    }

    callback(error);
  }

  private async rewrite(chunks: Chunk[], index: number, callback: Callback): Promise<void> {
    const { size, teeToStdout } = this.options;

    try {
      if(this.initPromise) await this.initPromise;

      for(let i = 0; i < chunks.length; ++i) {
        const { chunk } = chunks[i];

        this.size += chunk.length;
        if(this.timeoutPromise) await this.timeoutPromise;
        await this.file.write(chunk);

        if(teeToStdout && ! this.stdout.destroyed) this.stdout.write(chunk);
        if(size && this.size >= size) await this.rotate();
      }
    } catch(e) {
      return callback(e);
    }

    callback();
  }

  private async init(): Promise<void> {
    const { immutable, initialRotation, interval, size } = this.options;

    // In v15 was introduced the _constructor method to delay any _write(), _final() and _destroy() calls
    // Once v16 will be deprecated we can restore only following line
    // if(immutable) return this.immutate(true);
    if(immutable) return new Promise<void>((resolve, reject) => process.nextTick(() => this.immutate(true).then(resolve).catch(reject)));

    let stats: Stats;

    try {
      stats = await stat(this.filename);
    } catch(e) {
      if(e.code !== "ENOENT") throw e;

      return this.reopen(0);
    }

    if(! stats.isFile()) throw new Error(`Can't write on: ${this.filename} (it is not a file)`);

    if(initialRotation) {
      this.intervalBounds(this.now());
      const prev = this.prev;
      this.intervalBounds(new Date(stats.mtime.getTime()));

      if(prev !== this.prev) return this.rotate();
    }

    this.size = stats.size;
    if(! size || stats.size < size) return this.reopen(stats.size);
    if(interval) this.intervalBounds(this.now());

    return this.rotate();
  }

  private async makePath(name: string): Promise<string> {
    return mkdir(name.split(sep).slice(0, -1).join(sep), { recursive: true });
  }

  private async reopen(size: number): Promise<void> {
    let file: FileHandle;

    try {
      file = await open(this.filename, "a", this.options.mode);
    } catch(e) {
      if(e.code !== "ENOENT") throw e;

      await this.makePath(this.filename);
      file = await open(this.filename, "a", this.options.mode);
    }

    this.file = file;
    this.size = size;
    this.interval();
    this.emit("open", this.filename);
  }

  private async reclose(): Promise<void> {
    const { file } = this;

    if(! file) return;

    delete this.file;
    return file.close();
  }

  private now(): Date {
    return new Date();
  }

  private async rotate(): Promise<void> {
    const { immutable, rotate } = this.options;

    this.size = 0;
    this.rotation = this.now();

    this.clear();
    this.emit("rotation");
    await this.reclose();

    if(rotate) return this.classical();
    if(immutable) return this.immutate(false);

    return this.move();
  }

  private async findName(): Promise<string> {
    const { interval, path, intervalBoundary } = this.options;

    for(let index = 1; index < 1000; ++index) {
      const filename = path + this.generator(interval && intervalBoundary ? new Date(this.prev) : this.rotation, index);

      if(! (await exists(filename))) return filename;
    }

    throw new RotatingFileStreamError();
  }

  private async move(): Promise<void> {
    const { compress } = this.options;

    const filename = await this.findName();
    await this.touch(filename);

    if(compress) await this.compress(filename);
    else await rename(this.filename, filename);

    return this.rotated(filename);
  }

  private async touch(filename: string): Promise<void> {
    let file: FileHandle;

    try {
      file = await this.fsOpen(filename, "a");
    } catch(e) {
      if(e.code !== "ENOENT") throw e;

      await this.makePath(filename);
      file = await open(filename, "a");
    }

    await file.close();
    return this.unlink(filename);
  }

  private async classical(): Promise<void> {
    const { compress, path, rotate } = this.options;
    let rotatedName = "";

    for(let count = rotate; count > 0; --count) {
      const currName = path + this.generator(count);
      const prevName = count === 1 ? this.filename : path + this.generator(count - 1);

      if(! (await exists(prevName))) continue;
      if(! rotatedName) rotatedName = currName;

      if(count === 1 && compress) await this.compress(currName);
      else {
        try {
          await rename(prevName, currName);
        } catch(e) {
          if(e.code !== "ENOENT") throw e;

          await this.makePath(currName);
          await rename(prevName, currName);
        }
      }
    }

    return this.rotated(rotatedName);
  }

  private clear(): boolean {
    if(this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    return true;
  }

  private intervalBoundsBig(now: Date): void {
    const year = this.options.intervalUTC ? now.getUTCFullYear() : now.getFullYear();
    let month = this.options.intervalUTC ? now.getUTCMonth() : now.getMonth();
    let day = this.options.intervalUTC ? now.getUTCDate() : now.getDate();
    let hours = this.options.intervalUTC ? now.getUTCHours() : now.getHours();
    const { num, unit } = this.options.interval;

    if(unit === "M") {
      day = 1;
      hours = 0;
    } else if(unit === "d") hours = 0;
    else hours = parseInt((hours / num) as unknown as string, 10) * num;

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

      this.prev = parseInt((now.getTime() / period) as unknown as string, 10) * period;
      this.next = this.prev + period;
    }

    return new Date(this.prev);
  }

  private interval(): void {
    if(! this.options.interval) return;

    this.intervalBounds(this.now());

    const set = async (): Promise<void> => {
      const time = this.next - this.now().getTime();

      if(time <= 0) {
        try {
          this.timeoutPromise = this.rotate();

          await this.timeoutPromise;
          delete this.timeoutPromise;
        } catch(e) {}
      } else {
        this.timeout = setTimeout(set, time > this.maxTimeout ? this.maxTimeout : time);
        this.timeout.unref();
      }
    };

    set();
  }

  private async compress(filename: string): Promise<void> {
    const { compress } = this.options;

    if(typeof compress === "function") {
      await new Promise<void>((resolve, reject) => {
        this.exec(compress(this.filename, filename), (error, stdout, stderr) => {
          this.emit("external", stdout, stderr);
          error ? reject(error) : resolve();
        });
      });
    } else await this.gzip(filename);

    return this.unlink(this.filename);
  }

  private async gzip(filename: string): Promise<void> {
    const { mode } = this.options;
    const options = mode ? { mode } : {};
    const inp = this.fsCreateReadStream(this.filename, {});
    const out = this.fsCreateWriteStream(filename, options);
    const zip = this.createGzip();

    await new Promise<void>((resolve, reject) => {
      inp.once("error", reject);
      out.once("error", reject);
      zip.once("error", reject);
      out.once("finish", resolve);
      inp.pipe(zip).pipe(out);
    });

    await Promise.all([
      new Promise<void>(resolve => zip.close(resolve)),
      new Promise<void>(resolve =>
        out.close(err => {
          if(err) this.emit("warning", err);

          resolve();
        })
      )
    ]);
  }

  private async rotated(filename: string): Promise<void> {
    const { maxFiles, maxSize } = this.options;

    if(maxFiles || maxSize) await this.history(filename);

    this.emit("rotated", filename);

    return this.reopen(0);
  }

  private async history(filename: string): Promise<void> {
    const { history, maxFiles, maxSize } = this.options;
    const res: History[] = [];
    let files = [filename];

    try {
      const content = await this.fsReadFile(history, "utf8");

      files = [...content.toString().split("\n"), filename];
    } catch(e) {
      if(e.code !== "ENOENT") throw e;
    }

    for(const file of files) {
      if(file) {
        try {
          const stats = await this.fsStat(file);

          if(stats.isFile()) {
            res.push({
              name: file,
              size: stats.size,
              time: stats.mtime.getTime()
            });
          } else this.emit("warning", new Error(`File '${file}' contained in history is not a regular file`));
        } catch(e) {
          if(e.code !== "ENOENT") throw e;
        }
      }
    }

    res.sort((a, b) => a.time - b.time);

    if(maxFiles) {
      while(res.length > maxFiles) {
        const file = res.shift();

        await this.unlink(file.name);
        this.emit("removed", file.name, true);
      }
    }

    if(maxSize) {
      while(res.reduce((size, file) => size + file.size, 0) > maxSize) {
        const file = res.shift();

        await this.unlink(file.name);
        this.emit("removed", file.name, false);
      }
    }

    await writeFile(history, res.map(e => e.name).join("\n") + "\n", "utf-8");
    this.emit("history");
  }

  private async immutate(first: boolean): Promise<void> {
    const { size } = this.options;
    const now = this.now();

    for(let index = 1; index < 1000; ++index) {
      let fileSize = 0;
      let stats: Stats = undefined;

      this.filename = this.options.path + this.generator(now, index);

      try {
        stats = await this.fsStat(this.filename);
      } catch(e) {
        if(e.code !== "ENOENT") throw e;
      }

      if(stats) {
        fileSize = stats.size;

        if(! stats.isFile()) throw new Error(`Can't write on: '${this.filename}' (it is not a file)`);
        if(size && fileSize >= size) continue;
      }

      if(first) {
        this.last = this.filename;

        return this.reopen(fileSize);
      }

      await this.rotated(this.last);
      this.last = this.filename;

      return;
    }

    throw new RotatingFileStreamError();
  }

  private async unlink(filename: string): Promise<void> {
    try {
      await this.fsUnlink(filename);
    } catch(e) {
      if(e.code !== "ENOENT") throw e;

      this.emit("warning", e);
    }
  }
}

function buildNumberCheck(field: string): (type: string, options: Options, value: string) => void {
  return (type: string, options: Options, value: string): void => {
    const converted: number = parseInt(value, 10);

    if(type !== "number" || (converted as unknown) !== value || converted <= 0) throw new Error(`'${field}' option must be a positive integer number`);
  };
}

function buildStringCheck(field: keyof Options, check: (value: string) => any) {
  return (type: string, options: Options, value: string): void => {
    if(type !== "string") throw new Error(`Don't know how to handle 'options.${field}' type: ${type}`);

    options[field] = check(value) as never;
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

const intervalUnits: any = { M: true, d: true, h: true, m: true, s: true };

function checkIntervalUnit(ret: any, unit: string, amount: number): void {
  if(parseInt((amount / ret.num) as unknown as string, 10) * ret.num !== amount) throw new Error(`An integer divider of ${amount} is expected as ${unit} for 'options.interval'`);
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

const sizeUnits: any = { B: true, G: true, K: true, M: true };

function checkSize(value: string): any {
  const ret = checkMeasure(value, "size", sizeUnits);

  if(ret.unit === "K") return ret.num * 1024;
  if(ret.unit === "M") return ret.num * 1048576;
  if(ret.unit === "G") return ret.num * 1073741824;

  return ret.num;
}

const checks: any = {
  encoding:         (type: string, options: Opts, value: string): any => new TextDecoder(value),
  immutable:        (): void => {},
  initialRotation:  (): void => {},
  interval:         buildStringCheck("interval", checkInterval),
  intervalBoundary: (): void => {},
  intervalUTC:      (): void => {},
  maxFiles:         buildNumberCheck("maxFiles"),
  maxSize:          buildStringCheck("maxSize", checkSize),
  mode:             (): void => {},
  omitExtension:    (): void => {},
  rotate:           buildNumberCheck("rotate"),
  size:             buildStringCheck("size", checkSize),
  teeToStdout:      (): void => {},
  ...{
    compress: (type: string, options: Opts, value: boolean | string | Compressor): any => {
      if(value === false) return;
      if(! value) throw new Error("A value for 'options.compress' must be specified");
      if(type === "boolean") return (options.compress = (source: string, dest: string): string => `cat ${source} | gzip -c9 > ${dest}`);
      if(type === "function") return;
      if(type !== "string") throw new Error(`Don't know how to handle 'options.compress' type: ${type}`);
      if((value as unknown as string) !== "gzip") throw new Error(`Don't know how to handle compression method: ${value}`);
    },
    history: (type: string): void => {
      if(type !== "string") throw new Error(`Don't know how to handle 'options.history' type: ${type}`);
    },
    path: (type: string, options: Opts, value: string): void => {
      if(type !== "string") throw new Error(`Don't know how to handle 'options.path' type: ${type}`);
      if(value[value.length - 1] !== sep) options.path = value + sep;
    }
  }
};

function checkOpts(options: Options): Opts {
  const ret: Opts = {};
  let opt: keyof Options;

  for(opt in options) {
    const value = options[opt];
    const type = typeof value;

    if(! (opt in checks)) throw new Error(`Unknown option: ${opt}`);

    ret[opt] = options[opt] as never;
    checks[opt](type, ret, value);
  }

  if(! ret.path) ret.path = "";

  if(! ret.interval) {
    delete ret.immutable;
    delete ret.initialRotation;
    delete ret.intervalBoundary;
    delete ret.intervalUTC;
  }

  if(ret.rotate) {
    delete ret.history;
    delete ret.immutable;
    delete ret.maxFiles;
    delete ret.maxSize;
    delete ret.intervalBoundary;
    delete ret.intervalUTC;
  }

  if(ret.immutable) delete ret.compress;
  if(! ret.intervalBoundary) delete ret.initialRotation;

  return ret;
}

function createClassical(filename: string, compress: boolean, omitExtension: boolean): Generator {
  return (index: number): string => (index ? `${filename}.${index}${compress && ! omitExtension ? ".gz" : ""}` : filename);
}

function createGenerator(filename: string, compress: boolean, omitExtension: boolean): Generator {
  const pad = (num: number): string => (num > 9 ? "" : "0") + num;

  return (time: Date, index?: number): string => {
    if(! time) return filename as unknown as string;

    const month = time.getFullYear() + "" + pad(time.getMonth() + 1);
    const day = pad(time.getDate());
    const hour = pad(time.getHours());
    const minute = pad(time.getMinutes());

    return month + day + "-" + hour + minute + "-" + pad(index) + "-" + filename + (compress && ! omitExtension ? ".gz" : "");
  };
}

export function createStream(filename: string | Generator, options?: Options): RotatingFileStream {
  if(typeof options === "undefined") options = {};
  else if(typeof options !== "object") throw new Error(`The "options" argument must be of type object. Received type ${typeof options}`);

  const opts = checkOpts(options);
  const { compress, omitExtension } = opts;
  let generator: Generator;

  if(typeof filename === "string") generator = options.rotate ? createClassical(filename, !! compress, omitExtension) : createGenerator(filename, !! compress, omitExtension);
  else if(typeof filename === "function") generator = filename;
  else throw new Error(`The "filename" argument must be one of type string or function. Received type ${typeof filename}`);

  return new RotatingFileStream(generator, opts);
}
