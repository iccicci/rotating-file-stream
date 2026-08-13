import { exec } from "node:child_process";
import { type EventEmitterEventMap } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { access, type FileHandle, mkdir, open, rename, stat, symlink, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, sep } from "node:path";
import { Writable, type WritableEventMap } from "node:stream";
import { TextDecoder } from "node:util";
import { createGzip } from "node:zlib";

/**
 * Error thrown by the package for library-originated failures (invalid configuration, invariant
 * checks, unexpected thrown values, and similar). Node.js API errors are not wrapped.
 */
export class RotatingFileStreamError extends Error {}

/** External compression command builder. */
export type Compressor = (source: string, dest: string) => string;
/** Compression option accepted by `createStream`. */
export type Compress = boolean | "gzip" | Compressor;

/** Arguments passed to a {@link StandardGenerator} when producing a rotated file name. */
export interface GeneratorArguments {
  index: number;
  time: Date;
}

/**
 * File name generator used when classical UNIX logrotate behavior is enabled
 * (`options.rotate`).
 *
 * Called with `null` for the not-rotated file name, or with the rotation index
 * otherwise.
 */
export type ClassicalGenerator = (index: number | null) => string;

/**
 * File name generator used for standard rotation.
 *
 * Called with `null` for the not-rotated file name, or with both `time` and
 * `index` together otherwise.
 */
export type StandardGenerator = (args: GeneratorArguments | null) => string;

/** Either kind of accepted file name generator. */
export type Generator = ClassicalGenerator | StandardGenerator;

/** Event map exposed by `RotatingFileStream`. */
export interface RotatingFileStreamEventMap extends WritableEventMap, EventEmitterEventMap {
  external: [stdout: string, stderr: string];
  history: [];
  open: [filename: string];
  removed: [filename: string, number: boolean];
  rotated: [filename: string];
  rotation: [];
  warning: [error: Error];
}

/** Typed event-emitter surface for `RotatingFileStream`. */
export declare interface RotatingFileStream extends Writable {
  addListener<E extends keyof RotatingFileStreamEventMap>(event: E, listener: (...args: RotatingFileStreamEventMap[E]) => void): this;
  emit<E extends keyof RotatingFileStreamEventMap>(event: E, ...args: RotatingFileStreamEventMap[E]): boolean;
  listenerCount<E extends keyof RotatingFileStreamEventMap>(event: E, listener?: (...args: RotatingFileStreamEventMap[E]) => void): number;
  listeners<E extends keyof RotatingFileStreamEventMap>(event: E): ((...args: RotatingFileStreamEventMap[E]) => void)[];
  off<E extends keyof RotatingFileStreamEventMap>(event: E, listener: (...args: RotatingFileStreamEventMap[E]) => void): this;
  on<E extends keyof RotatingFileStreamEventMap>(event: E, listener: (...args: RotatingFileStreamEventMap[E]) => void): this;
  once<E extends keyof RotatingFileStreamEventMap>(event: E, listener: (...args: RotatingFileStreamEventMap[E]) => void): this;
  prependListener<E extends keyof RotatingFileStreamEventMap>(event: E, listener: (...args: RotatingFileStreamEventMap[E]) => void): this;
  prependOnceListener<E extends keyof RotatingFileStreamEventMap>(event: E, listener: (...args: RotatingFileStreamEventMap[E]) => void): this;
  rawListeners<E extends keyof RotatingFileStreamEventMap>(event: E): ((...args: RotatingFileStreamEventMap[E]) => void)[];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- mirrors `@types/node` Writable
  removeAllListeners<E extends keyof RotatingFileStreamEventMap>(event?: E): this;
  removeListener<E extends keyof RotatingFileStreamEventMap>(event: E, listener: (...args: RotatingFileStreamEventMap[E]) => void): this;
}

/** Supported interval units. */
export type IntervalUnit = "M" | "d" | "h" | "m" | "s";
/** Allowed hour-based interval values. */
type HourInterval = 1 | 2 | 3 | 4 | 6 | 8 | 12 | 24;
/** Allowed minute- and second-based interval values. */
type MinuteInterval = 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30 | 60;
/** String form accepted for interval rotation options. */
export type Interval = `${number}${"M" | "d"}` | `${HourInterval}h` | `${MinuteInterval}${"m" | "s"}`;

/** Supported file size units. */
export type FileSizeUnit = "B" | "K" | "M" | "G";
/** String form accepted for size-related options. */
export type FileSize = `${number}${FileSizeUnit}`;

/** Conditional interval option type preserving literal validation. */
type IntervalOpt<I extends string = string> = string extends I ? string : I extends Interval ? I : never;
/** Conditional file size option type preserving literal validation. */
type FileSizeOpt<S extends string = string> = string extends S ? string : S extends FileSize ? S : never;

/** Public options accepted by `createStream`. */
export interface Options<I extends string = string, MS extends string = string, RS extends string = string> {
  compress?: Compress;
  encoding?: BufferEncoding;
  history?: string;
  immutable?: boolean;
  initialRotation?: boolean;
  interval?: IntervalOpt<I>;
  intervalBoundary?: boolean;
  intervalUTC?: boolean;
  maxFiles?: number;
  maxSize?: FileSizeOpt<MS>;
  mode?: number;
  omitExtension?: boolean;
  path?: string;
  rotate?: number;
  size?: FileSizeOpt<RS>;
  symLink?: boolean;
  teeToStdout?: boolean;
}

/** Parsed, normalized options stored on the stream after `createStream` validation. */
interface BaseInternalOptions {
  compress?: Compress;
  encoding: BufferEncoding;
  history?: string;
  immutable?: boolean;
  initialRotation?: boolean;
  interval?: { num: number; unit: IntervalUnit };
  intervalBoundary?: boolean;
  intervalUTC?: boolean;
  maxFiles?: number;
  maxSize?: number;
  mode: number;
  omitExtension?: boolean;
  path: string;
  rotate?: number;
  size?: number;
  symLink?: boolean;
  teeToStdout?: boolean;
}

/** Normalized options for classical rotation mode. */
export type InternalOptionsWithRotate = BaseInternalOptions & {
  generator: ClassicalGenerator;
  rotate: number;
};

/** Normalized options for standard rotation mode. */
export type InternalOptionsWithoutRotate = Omit<BaseInternalOptions, "rotate"> & {
  generator: StandardGenerator;
  rotate?: undefined;
};

/** Union of normalized options stored by `RotatingFileStream`. */
export type InternalOptions = InternalOptionsWithoutRotate | InternalOptionsWithRotate;

/** Narrow normalized options to classical rotation (`options.rotate` is set). */
const isOptionsWithRotate = (options: InternalOptions): options is InternalOptionsWithRotate => options.rotate !== undefined;

/** Internal callback placeholder mirroring `node:stream` writable hooks. */
export type Callback = (error?: Error | null) => void;

/** Encoding type accepted by the stream write hooks. */
export type WriteEncoding = BufferEncoding | "buffer";

/** Buffered chunk placeholder reserved for the stream rewrite. */
export interface Chunk {
  chunk: Buffer;
  encoding: WriteEncoding;
}

/** Rotated file tracked while enforcing {@link Options.maxFiles} and {@link Options.maxSize}. */
interface History {
  name: string;
  size: number;
  time: number;
}

/**
 * Writable stream that implements rotating file output.
 *
 * It is exported mainly for `instanceof` checks and typed event support; users
 * are expected to create instances through `createStream`.
 */
export class RotatingFileStream extends Writable {
  /** Path of the not-rotated file (`options.path` plus the generator name). */
  private filename = "";
  /** Open file handle for the current log file, or `null` when none is open. */
  private handle: FileHandle | null = null;
  /** Path of the immutable-mode file that was last rotated away from. */
  private last = "";
  /**
   * Cap for a single interval `setTimeout` delay, in milliseconds.
   *
   * Intervals longer than this are scheduled as repeated shorter waits until the
   * window end is reached (Node timers cannot sleep arbitrarily long in one shot).
   */
  private maxTimeout = 2147483640;
  /** End of the current interval window, as a timestamp. */
  private next = 0;
  /** Normalized options stored on the stream after `createStream` validation. */
  private options: InternalOptions;
  /**
   * Base directory prepended to generated file names (same value as `options.path`).
   *
   * Relative to the process cwd when the option is relative; never rewritten to an
   * absolute path, so event payloads match the names listeners received in v3.
   */
  private path: string;
  /** While `_construct` is running, {@link RotatingFileStream.reopen} must not emit `open` yet. */
  private constructing = false;
  /** Set after `finish` has been emitted; `close` emits `finish` if it has not already. */
  private finished = false;
  /** Start of the current interval window, as a timestamp. */
  private prev = 0;
  /** In-flight {@link RotatingFileStream.rewrite}, or `null` when idle. */
  private rewritePromise: Promise<void> | null = null;
  /** Instant at which the current rotation job started. */
  private rotationTime!: Date;
  /** Current size, in bytes, of the file being written. */
  private size = 0;
  /** Pending interval timer, or `null` when none is scheduled. */
  private timeout: NodeJS.Timeout | null = null;
  /** In-flight interval-driven rotation, or `null` when idle. */
  private timeoutPromise: Promise<void> | null = null;

  /** Build a stream instance with normalized options. */
  constructor(options: InternalOptions) {
    super({
      // This is quite important: it ensures that _write and _writev always receive buffers.
      decodeStrings:   true,
      defaultEncoding: options.encoding
    });

    this.options = options;
    this.path = options.path;

    if(this.options.maxFiles || this.options.maxSize) {
      const { generator, history } = this.options;
      const historyName = history ?? `${generator(null)}.txt`;

      this.options.history = isAbsolute(historyName) ? historyName : `${this.path}${historyName}`;
    }

    this.once("error", () => this.destroy());

    this.on("close", () => {
      if(! this.finished) this.emit("finish");
    });
    this.on("finish", () => {
      this.finished = true;
      this.clear();
    });

    if(this.options.interval) this.intervalBounds(this.now());
  }

  /** Open the current log file for append, creating missing parent directories if needed. */
  _construct(done: Callback): void {
    (async () => {
      this.constructing = true;

      try {
        if(this.options.immutable) {
          await this.immutable(true);

          return;
        }

        this.filename = this.getFileName();

        try {
          const stats = await stat(this.filename);

          if(! stats.isFile()) throw new RotatingFileStreamError(`Can't write on: ${this.filename} (it is not a file)`);

          if(this.options.initialRotation) {
            this.intervalBounds(this.now());
            const prev = this.prev;

            this.intervalBounds(new Date(stats.mtime.getTime()));

            if(prev !== this.prev) {
              await this.rotate();

              return;
            }
          }

          if(this.options.size && stats.size >= this.options.size) {
            if(this.options.interval) this.intervalBounds(this.now());
            await this.rotate();
          } else await this.reopen(stats.size);
        } catch(error) {
          if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;

          await this.reopen(0);
        }
      } finally {
        this.constructing = false;
      }
    })().then(() => {
      this.emit("open", this.filename);
      done();
    }, done);
  }

  /** Cancel the interval timer, wait for any in-flight interval rotation, then close the handle. */
  _destroy(error: Error | null, done: Callback): void {
    void this.refinal(error, done);
  }

  /** Cancel the interval timer, wait for any in-flight interval rotation, then close the handle. */
  _final(done: Callback): void {
    void this.refinal(null, done);
  }

  /** Accept a single chunk and persist it through {@link RotatingFileStream.rewrite}. */
  _write(chunk: Buffer, encoding: WriteEncoding, done: Callback): void {
    this.rewrite([{ chunk, encoding }], done);
  }

  /** Accept a batch of chunks and persist them through {@link RotatingFileStream.rewrite}. */
  _writev(chunks: Chunk[], done: Callback): void {
    this.rewrite(chunks, done);
  }

  /** Clear the pending interval timer, if any. */
  private clear(): void {
    if(this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /** Close the current file handle when one is open and set it to `null`. */
  private async closeHandle(): Promise<void> {
    if(this.handle) {
      await this.handle.close();

      this.handle = null;
    }
  }

  /** Return whether `filename` exists on the filesystem. */
  private async exists(filename: string): Promise<boolean> {
    try {
      await access(filename);

      return true;
    } catch(error) {
      return false;
    }
  }

  /**
   * Find an unused rotated file name for the current rotation job.
   *
   * `index` starts at `1` when `options.size` is set, otherwise at `0`.
   */
  private async findName(): Promise<string> {
    const indexStart = this.options.size ? 1 : 0;

    for(let index = indexStart; index < indexStart + 1000; ++index) {
      const filename = this.getFileName(index);

      if(! (await this.exists(filename))) return filename;
    }

    throw new RotatingFileStreamError("Too many destination file attempts");
  }

  /**
   * Return the path of the not-rotated file when `index` is omitted, or of a rotated
   * file by calling the configured generator with the matching arguments.
   *
   * The result is `options.path` plus the generator name (relative when `path` is),
   * matching the strings emitted on `open`, `rotated`, and `removed`.
   *
   * When `options.intervalBoundary` is set, the `time` argument passed to the standard
   * generator is the lower boundary of the current rotation period (`new Date(this.prev)`)
   * rather than the instant when rotation started.
   */
  private getFileName(index?: number): string {
    const { options, path } = this;

    if(index === undefined) return `${path}${options.generator(null)}`;
    if(isOptionsWithRotate(options)) return `${path}${options.generator(index)}`;

    const time = options.intervalBoundary ? new Date(this.prev) : this.rotationTime;

    return `${path}${options.generator({ index, time })}`;
  }

  /**
   * Set {@link RotatingFileStream.prev} and {@link RotatingFileStream.next} to the interval window that
   * contains `now`, and return that window start.
   */
  private intervalBounds(now: Date): Date {
    const { interval } = this.options;

    if(! interval) throw new RotatingFileStreamError("Unexpected null interval");

    const { num, unit } = interval;

    if(unit === "M" || unit === "d" || unit === "h") this.intervalBoundsBig(now, interval);
    else {
      let period = 1000 * num;

      if(unit === "m") period *= 60;

      this.prev = parseInt((now.getTime() / period) as unknown as string, 10) * period;
      this.next = this.prev + period;
    }

    return new Date(this.prev);
  }

  /** Compute {@link RotatingFileStream.prev} and {@link RotatingFileStream.next} for month, day, or hour intervals. */
  private intervalBoundsBig(now: Date, interval: { num: number; unit: IntervalUnit }): void {
    const { intervalUTC } = this.options;

    const year = intervalUTC ? now.getUTCFullYear() : now.getFullYear();
    let month = intervalUTC ? now.getUTCMonth() : now.getMonth();
    let day = intervalUTC ? now.getUTCDate() : now.getDate();
    let hours = intervalUTC ? now.getUTCHours() : now.getHours();
    const { num, unit } = interval;

    if(unit === "M") {
      day = 1;
      hours = 0;
    } else if(unit === "d") hours = 0;
    else hours = parseInt((hours / num) as unknown as string, 10) * num;

    this.prev = intervalUTC ? Date.UTC(year, month, day, hours, 0, 0, 0) : new Date(year, month, day, hours, 0, 0, 0).getTime();

    if(unit === "M") month += num;
    else if(unit === "d") day += num;
    else hours += num;

    this.next = intervalUTC ? Date.UTC(year, month, day, hours, 0, 0, 0) : new Date(year, month, day, hours, 0, 0, 0).getTime();
  }

  /**
   * Schedule the next interval-driven rotation.
   *
   * When the current window has already ended, starts {@link RotatingFileStream.rotate}
   * immediately; otherwise arms a `setTimeout` (capped by {@link RotatingFileStream.maxTimeout})
   * that rechecks the remaining time.
   */
  private interval(): void {
    if(! this.options.interval) return;

    this.intervalBounds(this.now());

    const set = async (): Promise<void> => {
      const time = this.next - this.now().getTime();

      if(time <= 0) {
        // Wait for any in-flight rewrite before closing/renaming the current file.
        // Do not await inside `rotate` itself: size-based rotation is invoked from
        // within `rewrite` while `rewritePromise` is held (would deadlock).
        // Ignore rejection: waiters only need the write path to be idle.
        if(this.rewritePromise) await this.rewritePromise.catch(() => undefined);

        let release!: (value?: PromiseLike<void> | void) => void;
        let fail!: (reason?: unknown) => void;

        // Publish before `rotate` so concurrent writes / finalizers can await it even
        // when they run synchronously from the `rotation` event.
        this.timeoutPromise = new Promise<void>((resolve, reject) => {
          release = resolve;
          fail = reject;
        });

        try {
          await this.rotate();
          release();
          this.timeoutPromise = null;
        } catch(error) {
          fail(error);
          // Avoid an unhandled rejection when no write/final is awaiting yet.
          void this.timeoutPromise?.catch(() => undefined);
        }
      } else {
        this.timeout = setTimeout(() => void set(), time > this.maxTimeout ? this.maxTimeout : time);
        this.timeout.unref();
      }
    };

    void set();
  }

  /**
   * Pick or create the immutable-mode log file for the current rotation job.
   *
   * Scans numbered generator outputs until it finds a missing file or one still
   * under `options.size`. On the initial open (`first === true`) appends to that
   * file; on rotation emits `rotated` for {@link RotatingFileStream.last} and
   * switches to the next slot.
   */
  private async immutable(first: boolean): Promise<void> {
    if(isOptionsWithRotate(this.options)) throw new RotatingFileStreamError("Unexpected rotate option in immutable mode");

    const { generator, size } = this.options;
    const now = this.now();

    for(let index = 1; index < 1000; ++index) {
      let fileSize = 0;

      this.filename = `${this.path}${generator({ index, time: now })}`;

      let stats: Awaited<ReturnType<typeof stat>> | undefined;

      try {
        stats = await stat(this.filename);
      } catch(error) {
        if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;
      }

      if(stats) {
        fileSize = Number(stats.size);

        if(! stats.isFile()) throw new RotatingFileStreamError(`Can't write on: '${this.filename}' (it is not a file)`);
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

    throw new RotatingFileStreamError("Too many destination file attempts");
  }

  /**
   * Classical UNIX logrotate rotation: shift numbered backups and move the live file
   * into slot `.1` (or compress it there when `options.compress` is set).
   */
  private async classical(): Promise<void> {
    if(! isOptionsWithRotate(this.options)) throw new RotatingFileStreamError("Unexpected classical rotation without options.rotate");

    const { compress, rotate } = this.options;
    let rotatedName = "";

    for(let count = rotate; count > 0; --count) {
      const currName = this.getFileName(count);
      const prevName = count === 1 ? this.filename : this.getFileName(count - 1);

      if(! (await this.exists(prevName))) continue;
      if(! rotatedName) rotatedName = currName;

      if(count === 1 && compress) await this.compress(currName);
      else {
        try {
          await rename(prevName, currName);
        } catch(error) {
          if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;

          await mkdir(dirname(currName), { recursive: true });
          await rename(prevName, currName);
        }
      }
    }

    return this.rotated(rotatedName);
  }

  /**
   * Compress `source` into `dest` and remove `source`.
   *
   * Uses internal gzip when `options.compress` is `"gzip"`, or runs an external shell command
   * when it is a {@link Compressor} function. Defaults `source` to {@link RotatingFileStream.filename}.
   *
   * For external compression, always emits {@link RotatingFileStreamEventMap.external} with the
   * command `stdout` and `stderr` (including when the command exits with a non-zero status),
   * then rejects if the command failed.
   */
  private async compress(dest: string, source = this.filename): Promise<void> {
    const { compress } = this.options;

    if(typeof compress === "function") {
      await new Promise<void>((resolve, reject) => {
        exec(compress(source, dest), (error, stdout, stderr) => {
          this.emit("external", stdout, stderr);
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          if(error) reject(error);
          else resolve();
        });
      });
    } else await this.gzip(dest, source);

    await unlink(source);
  }

  /** Gzip `source` into `dest` by piping through a gzip transform stream. */
  private async gzip(dest: string, source: string): Promise<void> {
    const { mode } = this.options;
    const options = { mode };
    const inp = createReadStream(source);
    const out = createWriteStream(dest, options);
    const zip = createGzip();

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

  /**
   * Move the current not-rotated file to an available rotated name and reopen an empty log.
   *
   * Standard rotation only; classical mode uses {@link RotatingFileStream.classical}.
   */
  private async move(): Promise<void> {
    const filename = await this.findName();

    await this.touch(filename);
    await (this.options.compress ? this.compress(filename) : rename(this.filename, filename));
    await this.rotated(filename);
  }

  /** Return the current instant used for interval-bound calculations. */
  private now(): Date {
    return new Date();
  }

  /**
   * Cancel the interval timer, wait for any in-flight interval rotation and writes,
   * then close the handle.
   *
   * Shared by {@link RotatingFileStream._final} and {@link RotatingFileStream._destroy}.
   */
  private async refinal(pendingError: Error | null, done: Callback): Promise<void> {
    try {
      this.clear();
      if(this.rewritePromise) await this.rewritePromise;
      if(this.timeoutPromise) await this.timeoutPromise;
      await this.closeHandle();
    } catch(error) {
      done(
        pendingError ??
          (error instanceof Error ? error : new RotatingFileStreamError(`Unexpected error while closing handle: ${JSON.stringify(error)}`))
      );

      return;
    }

    done(pendingError);
  }

  /** Open {@link RotatingFileStream.filename} for append, set {@link RotatingFileStream.size}, and emit `open`. */
  private async reopen(size: number): Promise<void> {
    try {
      this.handle = await open(this.filename, "a", this.options.mode);
    } catch(error) {
      if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;

      await mkdir(dirname(this.filename), { recursive: true });
      this.handle = await open(this.filename, "a", this.options.mode);
    }

    this.size = size;
    this.interval();
    if(this.options.symLink) await this.updateSymLink();
    if(! this.constructing) this.emit("open", this.filename);
  }

  /**
   * Concatenate writeable chunks while respecting `options.size`, rotating as needed.
   *
   * Chunks that fit under the size limit are buffered together; when a chunk would
   * reach the limit the buffer is written, rotation runs, and buffering restarts.
   * A single chunk is never split across files. When `options.teeToStdout` is set,
   * each chunk is also written to `process.stdout`.
   *
   * Publishes {@link RotatingFileStream.rewritePromise} for the duration of the work so
   * an interval timer waits before closing the handle. Conversely, waits once for any
   * in-flight interval-driven rotation ({@link RotatingFileStream.timeoutPromise}) before
   * touching the file handle; the reverse lock keeps a new interval rotation from
   * starting mid-rewrite.
   *
   * Invokes `done` when the write completes or fails.
   */
  private rewrite(chunks: Chunk[], done: Callback): void {
    // Publish before any await so an interval timer that fires mid-write can wait.
    this.rewritePromise = (async () => {
      if(this.timeoutPromise) await this.timeoutPromise;

      const { size } = this.options;
      let tmp: Buffer[] = [];

      const writeTmp = async (): Promise<void> => {
        if(! tmp.length) return;
        if(! this.handle) throw new RotatingFileStreamError("Unexpected null file handle");

        await this.handle.write(Buffer.concat(tmp));
        tmp = [];
      };

      for(const { chunk } of chunks) {
        this.size += chunk.length;
        tmp.push(chunk);

        if(this.options.teeToStdout && ! process.stdout.destroyed) process.stdout.write(chunk);

        if(size && this.size >= size) {
          await writeTmp();
          await this.rotate();
        }
      }

      await writeTmp();
    })();

    // `finally` before `then`/`catch` so `rewritePromise` is cleared before `done()`.
    // Node may start the next `_write` synchronously from `done()`; clearing after
    // would wipe that newer promise.
    this.rewritePromise
      .finally(() => {
        this.rewritePromise = null;
      })
      .then(
        () => done(),
        error => done(error instanceof Error ? error : new RotatingFileStreamError(`Unexpected error while writing: ${JSON.stringify(error)}`))
      );
  }

  /**
   * Start a rotation job: reset size, clear the interval timer, emit `rotation`,
   * close the handle, then run the configured rotation path.
   */
  private async rotate(): Promise<void> {
    this.size = 0;
    this.rotationTime = this.now();
    this.clear();
    this.emit("rotation");
    await this.closeHandle();

    if(this.options.immutable) return this.immutable(false);
    if(isOptionsWithRotate(this.options)) return this.classical();

    await this.move();
  }

  /**
   * Finish a rotation job: enforce history limits when configured, emit `rotated`,
   * then reopen the not-rotated file empty.
   */
  private async rotated(filename: string): Promise<void> {
    const { maxFiles, maxSize } = this.options;

    if(maxFiles || maxSize) await this.history(filename);

    this.emit("rotated", filename);
    await this.reopen(0);
  }

  /**
   * Read, update, and rewrite the history file after a rotation.
   *
   * Trims tracked files by {@link Options.maxFiles} first, then by {@link Options.maxSize},
   * unlinks removed entries, and emits `removed` and `history`.
   */
  private async history(filename: string): Promise<void> {
    const { history, maxFiles, maxSize } = this.options;
    const entries: History[] = [];
    let files = [filename];

    if(! history) throw new RotatingFileStreamError("History file path is not configured");

    try {
      const content = await this.readHistoryContent(history);

      files = [...content.split("\n"), filename];
    } catch(error) {
      if(! (error instanceof Error)) throw error;
      if(! ("code" in error) || error.code !== "ENOENT") throw error;
    }

    for(const file of files) {
      if(file) {
        try {
          const stats = await stat(file);

          if(stats.isFile()) {
            entries.push({
              name: file,
              size: stats.size,
              time: stats.mtime.getTime()
            });
          } else this.emit("warning", new RotatingFileStreamError(`File '${file}' contained in history is not a regular file`));
        } catch(error) {
          if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;
        }
      }
    }

    entries.sort((a, b) => a.time - b.time);

    if(maxFiles) {
      while(entries.length > maxFiles) {
        const file = entries.shift()!;

        await this.safeUnlink(file.name);
        this.emit("removed", file.name, true);
      }
    }

    if(maxSize) {
      while(entries.reduce((size, file) => size + file.size, 0) > maxSize) {
        const file = entries.shift()!;

        await this.safeUnlink(file.name);
        this.emit("removed", file.name, false);
      }
    }

    await this.writeHistoryContent(history, `${entries.map(entry => entry.name).join("\n")}\n`);
    this.emit("history");
  }

  /** Read the full UTF-8 contents of a history file via {@link FileHandle.read}. */
  private async readHistoryContent(historyPath: string): Promise<string> {
    const handle = await open(historyPath, "r");

    try {
      const { size } = await handle.stat();

      if(size === 0) return "";

      const buffer = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buffer, 0, size, 0);

      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  }

  /** Write UTF-8 history contents via {@link FileHandle.write}, creating parent directories if needed. */
  private async writeHistoryContent(historyPath: string, content: string): Promise<void> {
    await mkdir(dirname(historyPath), { recursive: true });

    const handle = await open(historyPath, "w", this.options.mode);

    try {
      const buffer = Buffer.from(content, "utf8");

      await handle.write(buffer, 0, buffer.length);
    } finally {
      await handle.close();
    }
  }

  /** Remove a rotated file; an `ENOENT` is emitted as `warning` and ignored. */
  private async safeUnlink(filename: string): Promise<void> {
    try {
      await unlink(filename);
    } catch(error) {
      if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;

      this.emit("warning", error);
    }
  }

  /**
   * Ensure the parent path of `filename` exists by creating and removing a placeholder file.
   *
   * Used so a subsequent rename into that path cannot fail for a missing directory.
   * An `ENOENT` from the placeholder unlink is emitted as `warning` and ignored.
   */
  private async touch(filename: string): Promise<void> {
    let file: FileHandle;

    try {
      file = await open(filename, "a", this.options.mode);
    } catch(error) {
      if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;

      await mkdir(dirname(filename), { recursive: true });
      file = await open(filename, "a", this.options.mode);
    }

    await file.close();

    try {
      await unlink(filename);
    } catch(error) {
      if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;

      this.emit("warning", error);
    }
  }

  /**
   * Point the not-rotated file name at {@link RotatingFileStream.filename} via a symbolic link.
   *
   * Used when `options.symLink` is set together with `options.immutable`.
   */
  private async updateSymLink(): Promise<void> {
    const linkName = this.getFileName();

    try {
      await unlink(linkName);
    } catch(error) {
      if(! (error instanceof Error) || ! ("code" in error) || error.code !== "ENOENT") throw error;
    }

    await symlink(basename(this.filename), linkName);
  }
}

/** Public option names accepted by `createStream`. */
type OptionName = keyof Options;
/** Validation function used for a single option. */
type OptionChecker = (type: string, options: BaseInternalOptions, value: unknown) => void;
/** Lookup table for supported one-letter units. */
type UnitMap = { [unit: string]: true | undefined };

/** Units accepted for size parsing. */
const sizeUnits: UnitMap = { B: true, G: true, K: true, M: true };
/** Units accepted for interval parsing. */
const intervalUnits: UnitMap = { d: true, h: true, m: true, M: true, s: true };

/** Checker used for options that need no extra validation. */
const noopChecker: OptionChecker = () => undefined;

/** Ensure an option is a positive integer number. */
const assertPositiveInteger = (field: string, type: string, value: unknown): void => {
  const converted = parseInt(value as string, 10);

  if(type !== "number" || converted !== value || converted <= 0)
    throw new RotatingFileStreamError(`'${field}' option must be a positive integer number`);
};

/** Parse a `<number><unit>` string using the provided unit map. */
const parseMeasure = (value: string, what: string, units: UnitMap): { num: number; unit: string } => {
  const num = parseInt(value, 10);

  if(Number.isNaN(num)) throw new RotatingFileStreamError(`Unknown 'options.${what}' format: ${value}`);
  if(num <= 0) throw new RotatingFileStreamError(`A positive integer number is expected for 'options.${what}'`);

  const unit = value.replace(/^[ 0]*/g, "").slice(String(num).length, String(num).length + 1);

  if(! unit) throw new RotatingFileStreamError(`Missing unit for 'options.${what}'`);
  if(! units[unit]) throw new RotatingFileStreamError(`Unknown 'options.${what}' unit: ${unit}`);

  return { num, unit };
};

/** Parse a human-readable size string into bytes. */
const parseSize = (value: string, what: string): number => {
  const { num, unit } = parseMeasure(value, what, sizeUnits);

  if(unit === "K") return num * 1024;
  if(unit === "M") return num * 1048576;
  if(unit === "G") return num * 1073741824;

  return num;
};

/** Ensure an interval value divides the target amount exactly. */
const assertIntervalDivider = (num: number, unit: string, amount: number): void => {
  if(Math.trunc(amount / num) * num !== amount)
    throw new RotatingFileStreamError(`An integer divider of ${amount} is expected as ${unit} for 'options.interval'`);
};

/** Parse and validate an interval option string. */
const parseInterval = (value: string): { num: number; unit: IntervalUnit } => {
  const ret = parseMeasure(value, "interval", intervalUnits) as { num: number; unit: IntervalUnit };

  if(ret.unit === "h") assertIntervalDivider(ret.num, "hours", 24);
  if(ret.unit === "m") assertIntervalDivider(ret.num, "minutes", 60);
  if(ret.unit === "s") assertIntervalDivider(ret.num, "seconds", 60);

  return ret;
};

/** Per-option validators and normalizers used by `checkOpts`. */
const checkers: { [name in OptionName]: OptionChecker } = {
  compress: (type, options, value) => {
    if(value === false) return;
    if(! value) throw new RotatingFileStreamError("A value for 'options.compress' must be specified");
    if(type === "boolean") {
      options.compress = (source: string, dest: string): string => `cat ${source} | gzip -c9 > ${dest}`;

      return;
    }
    if(type === "function") return;
    if(type !== "string") throw new RotatingFileStreamError(`Don't know how to handle 'options.compress' type: ${type}`);

    const method = value as string;

    if(method !== "gzip") throw new RotatingFileStreamError(`Don't know how to handle compression method: ${method}`);
  },
  encoding: (_type, _options, value) => {
    new TextDecoder(value as string);
  },
  history: type => {
    if(type !== "string") throw new RotatingFileStreamError(`Don't know how to handle 'options.history' type: ${type}`);
  },
  immutable:       noopChecker,
  initialRotation: noopChecker,
  interval:        (type, options, value) => {
    if(type !== "string") throw new RotatingFileStreamError(`Don't know how to handle 'options.interval' type: ${type}`);
    options.interval = parseInterval(value as string);
  },
  intervalBoundary: noopChecker,
  intervalUTC:      noopChecker,
  maxFiles:         (type, _options, value) => assertPositiveInteger("maxFiles", type, value),
  maxSize:          (type, options, value) => {
    if(type !== "string") throw new RotatingFileStreamError(`Don't know how to handle 'options.maxSize' type: ${type}`);
    options.maxSize = parseSize(value as string, "maxSize");
  },
  mode:          noopChecker,
  omitExtension: noopChecker,
  path:          (type, options, value) => {
    if(type !== "string") throw new RotatingFileStreamError(`Don't know how to handle 'options.path' type: ${type}`);
    const path = value as string;

    if(path !== "" && ! path.endsWith(sep)) options.path = path + sep;
  },
  rotate: (type, _options, value) => assertPositiveInteger("rotate", type, value),
  size:   (type, options, value) => {
    if(type !== "string") throw new RotatingFileStreamError(`Don't know how to handle 'options.size' type: ${type}`);
    options.size = parseSize(value as string, "size");
  },
  symLink:     noopChecker,
  teeToStdout: noopChecker
};

/** Validate public options and normalize them for internal use. */
const checkOpts = <I extends string = string, MS extends string = string, RS extends string = string>(options: Options<I, MS, RS>) => {
  const ret: BaseInternalOptions = { encoding: "utf8", mode: 0o666, path: "" };

  for(const opt of Object.keys(options) as OptionName[]) {
    const value = options[opt];
    const type = typeof value;

    if(! (opt in checkers)) throw new RotatingFileStreamError(`Unknown option: ${opt}`);

    ret[opt] = value as never;
    checkers[opt](type, ret, value);
  }

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
    delete ret.initialRotation;
    delete ret.intervalBoundary;
    delete ret.intervalUTC;
  }

  if(ret.immutable) {
    delete ret.compress;
    delete ret.initialRotation;
  } else delete ret.symLink;

  if(! ret.intervalBoundary && ! ret.initialRotation) delete ret.intervalUTC;

  return ret;
};

/** Ensure a user-provided generator declares exactly one parameter. */
const assertSingleParameter = (generator: Generator) => {
  if(generator.length !== 1) throw new RotatingFileStreamError("File name generator must accept exactly one parameter");
};

/** Assertion function that narrows a generator after distinct-name probing. */
type AssertDistinctNames = <T extends Generator>(generator: Generator, probe: (generator: T) => string[]) => asserts generator is T;

/** Ensure probed generator outputs are all distinct. */
const assertDistinctNames: AssertDistinctNames = (generator, probe) => {
  const names = probe(generator as Parameters<typeof probe>[0]);

  if(new Set(names).size !== names.length)
    throw new RotatingFileStreamError("File name generator must return different names for null and for distinct rotation parameters");
};

/** Probe inputs for a classical generator. */
const probeClassicalNames = (generator: ClassicalGenerator) => [generator(null), generator(1), generator(2)];

/** Probe inputs for a standard generator. */
const probeStandardNames = (generator: StandardGenerator) => {
  const past = new Date(1976, 0, 23, 15);
  const now = new Date();

  return [
    generator(null),
    generator({ index: 0, time: past }),
    generator({ index: 1, time: past }),
    generator({ index: 0, time: now }),
    generator({ index: 1, time: now })
  ];
};

/** Validate and narrow a classical generator. */
const checkClassicalGenerator = (generator: Generator) => {
  assertSingleParameter(generator);
  assertDistinctNames(generator, probeClassicalNames);

  return generator;
};

/** Validate and narrow a standard generator. */
const checkStandardGenerator = (generator: Generator) => {
  assertSingleParameter(generator);
  assertDistinctNames(generator, probeStandardNames);

  return generator;
};

/** Build the default classical rotated-file-name generator. */
const createClassicalGenerator =
  (filename: string, compress?: Compress, omitExtension?: boolean) =>
    (index: number | null): string =>
      index ? `${filename}.${index}${compress && ! omitExtension ? ".gz" : ""}` : filename;

/** Left-pad a number with a leading zero when needed. */
const pad = (num: number): string => `${num > 9 ? "" : "0"}${num}`;

/** Build the default standard rotated-file-name generator. */
const createStandardGenerator =
  (filename: string, compress?: Compress, omitExtension?: boolean) =>
    (args: GeneratorArguments | null): string => {
      if(! args) return filename;

      const { index, time } = args;
      const month = `${time.getFullYear()}${pad(time.getMonth() + 1)}`;
      const day = pad(time.getDate());
      const hour = pad(time.getHours());
      const minute = pad(time.getMinutes());
      // Do not include the index in the file name when it is 0
      const idx = index ? `-${index}` : "";

      return `${month}${day}-${hour}${minute}${idx}-${filename}${compress && ! omitExtension ? ".gz" : ""}`;
    };

/** Options shape required when `rotate` is enabled. */
export type OptionsWithRotate<I extends string = string, MS extends string = string, RS extends string = string> = Options<I, MS, RS> & {
  rotate: number;
};

/** Options shape used when `rotate` is absent. */
export type OptionsWithoutRotate<I extends string = string, MS extends string = string, RS extends string = string> = Omit<
  Options<I, MS, RS>,
  "rotate"
> & {
  rotate?: undefined;
};

/** Create a stream using classical rotation mode. */
export function createStream<I extends string = string, MS extends string = string, RS extends string = string>(
  filename: string | ClassicalGenerator,
  options: OptionsWithRotate<I, MS, RS>
): RotatingFileStream;
/** Create a stream using standard rotation mode. */
export function createStream<I extends string = string, MS extends string = string, RS extends string = string>(
  filename: string | StandardGenerator,
  options?: OptionsWithoutRotate<I, MS, RS>
): RotatingFileStream;
/** Create a rotating file stream from validated options and a file-name source. */
export function createStream<I extends string = string, MS extends string = string, RS extends string = string>(
  filename: string | Generator,
  options?: Options<I, MS, RS>
): RotatingFileStream {
  const rawOptions: unknown = options;

  if(rawOptions === undefined) options = {};
  else if(typeof rawOptions !== "object" || rawOptions === null)
    throw new RotatingFileStreamError(`The "options" argument must be of type object. Received type ${typeof rawOptions}`);
  else options = rawOptions;

  const opts = checkOpts(options);
  const { rotate, ...rest } = opts;
  const { compress, omitExtension } = opts;

  if(typeof filename !== "string" && typeof filename !== "function")
    throw new RotatingFileStreamError(`The "filename" argument must be one of type string or function. Received type ${typeof filename}`);

  if(rotate) {
    return new RotatingFileStream({
      ...rest,
      generator: typeof filename === "string" ? createClassicalGenerator(filename, compress, omitExtension) : checkClassicalGenerator(filename),
      rotate
    });
  }

  return new RotatingFileStream({
    ...rest,
    generator: typeof filename === "string" ? createStandardGenerator(filename, compress, omitExtension) : checkStandardGenerator(filename)
  });
}
