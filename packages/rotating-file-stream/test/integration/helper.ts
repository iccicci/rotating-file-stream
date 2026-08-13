import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import {
  type Chunk,
  type ClassicalGenerator,
  createStream,
  type OptionsWithoutRotate,
  type OptionsWithRotate,
  type RotatingFileStream,
  type StandardGenerator,
  type WriteEncoding
} from "../../index.ts";

/** Absolute path of the per-file temporary directory while the suite is active. */
let activeTempDir: string | undefined;

/** Native timers captured at module load so close-wait works under Vitest fake timers. */
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

/** Arguments forwarded to the real `createStream` factory. */
export type StreamArgs =
  | [filename: string | ClassicalGenerator, options: OptionsWithRotate]
  | [filename: string | StandardGenerator, options?: OptionsWithoutRotate]
  | [options: OptionsWithoutRotate];

/** Expected content of a gzip-compressed file, compared after decompression. */
export interface UnzippedFile {
  /** UTF-8 text obtained by g-unzipping the file. */
  unzipped: string;
}

/** Expected file body: UTF-8 text as stored, raw bytes, or uncompressed text of a gzip file. */
export type ExpectedFile = string | Buffer | UnzippedFile;

/** Map of relative paths to expected file contents after the stream closes. */
export type ExpectedFiles = { [filename: string]: ExpectedFile };

/** Value recorded for an `error` event: `code` when present, otherwise `message`. */
export type ErrorEventValue = string | number;

/**
 * One recorded stream event or Writable hook call as a compact tuple.
 * `error` stores `code` or `message`; `warning` stores `message`.
 * `_construct`, `_write`, `_writev`, `_final` and `_destroy` omit the `done` callback.
 */
export type EventEntry =
  | ["_construct"]
  | ["_destroy", ErrorEventValue | null]
  | ["_final"]
  | ["_write", Buffer, WriteEncoding]
  | ["_writev", Chunk[]]
  | ["close"]
  | ["error", ErrorEventValue]
  | ["external", string, string]
  | ["finish"]
  | ["history"]
  | ["open", string]
  | ["removed", string, boolean]
  | ["rotated", string]
  | ["rotation"]
  | ["warning", string];

/** Specification of a single filesystem integration test. */
export interface IntegrationTestSpec {
  /** Optional assertions after `close` and file checks (e.g. captured stdout). */
  assert?: () => void | Promise<void>;
  /** Vitest test title used as the `it(...)` description. */
  description: string;
  /** Ordered event tuples expected by the time `close` is emitted. */
  events: EventEntry[];
  /** Generated files to check after `close`; omit to skip filesystem assertions. */
  files?: ExpectedFiles;
  /** Synchronous or async test body; schedule further work with stream write callbacks. */
  run: (rfs: RotatingFileStream) => void | Promise<void>;
  /** Optional hook before `createStream` (create files, mocks, timers that affect open). */
  setup?: () => void;
  /** Arguments for the real `createStream`; defaults to `["test.log"]`. May be lazy. */
  stream?: StreamArgs | (() => StreamArgs);
  /** How long to wait for `close` before failing; defaults to 5000ms. */
  timeoutMs?: number;
}

/** Default `createStream` filename when {@link IntegrationTestSpec.stream} is omitted. */
const defaultFilename = "test.log";

/** Default wait for the stream `close` event. */
const defaultTimeoutMs = 5000;

/** Extra Vitest budget on top of {@link defaultTimeoutMs} so the wait can reject first. */
const extraTestTimeoutMs = 1000;

/**
 * Create a unique temporary directory for the file, `chdir` into it for the whole
 * suite, empty it after each test, and restore cwd / mocks when the file ends.
 *
 * Call once per integration test file, at module scope or in the outermost `describe`.
 */
export const useIntegrationSuite = (): void => {
  let previousCwd = "";
  let tempDir = "";

  beforeAll(async () => {
    previousCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), "rfs-"));
    process.chdir(tempDir);
    activeTempDir = tempDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    await emptyDirectory(".");
  });

  afterAll(async () => {
    process.chdir(previousCwd);
    activeTempDir = undefined;
    if(tempDir) await rm(tempDir, { force: true, recursive: true });
  });
};

/** Run one integration spec (stream lifecycle, events, files). */
export const runIntegrationSpec = async (spec: IntegrationTestSpec): Promise<void> => {
  if(! activeTempDir) throw new Error("useIntegrationSuite() must be called once per integration test file before integrationTest()");

  const timeoutMs = spec.timeoutMs ?? defaultTimeoutMs;

  spec.setup?.();

  const rfs = openStream(spec.stream);
  const events = recordEvents(rfs);
  const closed = waitForClose(rfs, timeoutMs);

  try {
    await spec.run(rfs);
    await closed;
    expect(events).toEqual(spec.events);
    await expectFiles(spec.files);
    await spec.assert?.();
  } finally {
    rfs.destroy();
  }
};

/**
 * Register one `it` that creates a stream, runs the test body, waits for `close`,
 * then asserts event order and generated file contents.
 */
export const integrationTest = (spec: IntegrationTestSpec): void => {
  const timeoutMs = spec.timeoutMs ?? defaultTimeoutMs;

  it(spec.description, () => runIntegrationSpec(spec), timeoutMs + extraTestTimeoutMs);
};

/**
 * Register an `it.each` over several specs that share the same assertion pattern
 * but differ in options, events, or file expectations.
 */
export const integrationTestEach = (cases: IntegrationTestSpec[]): void => {
  const timeoutMs = Math.max(...cases.map(spec => (spec.timeoutMs ?? defaultTimeoutMs) + extraTestTimeoutMs));

  it.each(cases.map(spec => [spec.description, spec] as const))("%s", (_title, spec) => runIntegrationSpec(spec), timeoutMs);
};

/** Build a stream from optional {@link StreamArgs}, defaulting to `test.log`. */
const openStream = (stream?: StreamArgs | (() => StreamArgs)): RotatingFileStream => {
  const args = typeof stream === "function" ? stream() : stream;

  if(! args) return createStream(defaultFilename);
  if(args.length === 1) {
    const only = args[0];

    if(typeof only === "object") return createStream(defaultFilename, only);

    return createStream(only);
  }

  return createStream(args[0] as never, args[1] as never);
};

/** Record compact event tuples in emission order, including Writable hook calls. */
const recordEvents = (rfs: RotatingFileStream): EventEntry[] => {
  const events: EventEntry[] = [];
  const originalConstruct = rfs._construct;
  const originalDestroy = rfs._destroy;
  const originalFinal = rfs._final;
  const originalWrite = rfs._write;
  const originalWritev = rfs._writev;

  rfs._construct = done => {
    events.push(["_construct"]);
    originalConstruct.call(rfs, done);
  };

  rfs._destroy = (error, done) => {
    events.push(["_destroy", error ? relativize(String(errorValue(error))) : null]);
    originalDestroy.call(rfs, error, done);
  };

  rfs._final = done => {
    events.push(["_final"]);
    originalFinal.call(rfs, done);
  };

  rfs._write = (chunk, encoding, done) => {
    events.push(["_write", chunk, encoding]);
    originalWrite.call(rfs, chunk, encoding, done);
  };

  rfs._writev = (chunks, done) => {
    events.push(["_writev", chunks.map(({ chunk, encoding }) => ({ chunk, encoding }))]);
    originalWritev.call(rfs, chunks, done);
  };

  rfs.on("close", () => events.push(["close"]));
  rfs.on("error", error => events.push(["error", relativize(String(errorValue(error)))]));
  rfs.on("external", (stdout, stderr) => events.push(["external", relativize(stdout), relativize(stderr)]));
  rfs.on("finish", () => events.push(["finish"]));
  rfs.on("history", () => events.push(["history"]));
  rfs.on("open", filename => events.push(["open", relativize(filename)]));
  rfs.on("removed", (filename, number) => events.push(["removed", relativize(filename), number]));
  rfs.on("rotated", filename => events.push(["rotated", relativize(filename)]));
  rfs.on("rotation", () => events.push(["rotation"]));
  rfs.on("warning", error => events.push(["warning", error.message]));

  return events;
};

/** Strip the suite temp directory prefix so expected event paths stay relative. */
const relativize = (value: string): string => {
  if(! activeTempDir) return value;

  const prefix = activeTempDir.endsWith(sep) ? activeTempDir : `${activeTempDir}${sep}`;

  return value.includes(prefix) ? value.split(prefix).join("") : value;
};

/** Resolve when the stream emits `close`, or reject after `timeoutMs` (wall clock). */
const waitForClose = (rfs: RotatingFileStream, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;

    const timer = realSetTimeout(() => {
      if(settled) return;
      settled = true;
      rfs.destroy();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for RotatingFileStream 'close'`));
    }, timeoutMs);

    rfs.once("close", () => {
      if(settled) return;
      settled = true;
      realClearTimeout(timer);
      resolve();
    });
  });

/** Compare generated files to {@link ExpectedFiles}, unzipping when requested. */
const expectFiles = async (files?: ExpectedFiles): Promise<void> => {
  if(! files) return;

  for(const filename of Object.keys(files)) {
    const expected = files[filename];
    const raw = await readFile(filename);

    if(Buffer.isBuffer(expected)) expect(raw).toEqual(expected);
    else if(typeof expected === "string") expect(raw.toString("utf8")).toBe(expected);
    else expect(gunzipSync(raw).toString("utf8")).toBe(expected.unzipped);
  }
};

/** Prefer `error.code` when it is a string or number; otherwise use `message`. */
const errorValue = (error: Error): ErrorEventValue => {
  if("code" in error) {
    const { code } = error;

    if(typeof code === "string" || typeof code === "number") return code;
  }

  return error.message;
};

/** Remove every entry in `dir` without deleting `dir` itself. */
const emptyDirectory = async (dir: string): Promise<void> => {
  const entries = await readdir(dir);

  await Promise.all(entries.map(entry => rm(join(dir, entry), { force: true, recursive: true })));
};
