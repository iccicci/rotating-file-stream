import { type FileHandle } from "node:fs/promises";

import {
  type Callback,
  type Chunk,
  type ClassicalGenerator,
  createStream as originalCreateStream,
  type Generator,
  type InternalOptions,
  type InternalOptionsWithoutRotate,
  type InternalOptionsWithRotate,
  type Options,
  type OptionsWithoutRotate,
  type OptionsWithRotate,
  type RotatingFileStream,
  type StandardGenerator
} from "../../index.ts";

/** Test-visible copy of `RotatingFileStream` private/protected fields. Keep in sync with the class. */
interface PublicRotatingFileStream {
  /** Classical UNIX logrotate rotation for `options.rotate` mode. */
  classical: () => Promise<void>;
  /** Clear the pending interval timer, if any. */
  clear: () => void;
  /** Close the current file handle when one is open and set it to `null`. */
  closeHandle: () => Promise<void>;
  /** Path of the file currently being written (`options.path` plus generator name). */
  filename: string;
  /** Find an unused rotated file name for the current rotation job. */
  findName: () => Promise<string>;
  /** Read, update, and rewrite the history file after a rotation. */
  history: (filename: string) => Promise<void>;
  /** Pick or create the immutable-mode log file for the current rotation job. */
  immutable: (first: boolean) => Promise<void>;
  /** Path of the not-rotated or rotated file produced by the configured generator. */
  getFileName: (index?: number) => string;
  /** Open file handle for the current log file, or `null` when none is open. */
  handle: FileHandle | null;
  /** Path of the immutable-mode file that was last rotated away from. */
  last: string;
  /** Schedule the next interval-driven rotation. */
  interval: () => void;
  /** Set `prev` / `next` to the interval window that contains `now`, and return that window start. */
  intervalBounds: (now: Date) => Date;
  /** Compute `prev` / `next` for month, day, or hour intervals. */
  intervalBoundsBig: (now: Date) => void;
  /** Cap for a single interval `setTimeout` delay, in milliseconds. */
  maxTimeout: number;
  /** Move the current not-rotated file to an available rotated name and reopen an empty log. */
  move: () => Promise<void>;
  /** End of the current interval window, as a timestamp. */
  next: number;
  /** Return the current instant used for interval-bound calculations. */
  now: () => Date;
  /** Normalized options stored on the stream after `createStream` validation. */
  options: InternalOptions;
  /** Base directory prepended to generated file names (`options.path`). */
  path: string;
  /** Start of the current interval window, as a timestamp. */
  prev: number;
  /** Cancel the interval timer, wait for in-flight interval rotation, then close the handle. */
  refinal: (error: Error | null, done: Callback) => Promise<void>;
  /** Wait for queued and in-flight writes, then invoke {@link Writable.destroy}. */
  finishDestroy: () => Promise<void>;
  /** Open the not-rotated file for append, set size, and emit `open`. */
  reopen: (size: number) => Promise<void>;
  /** Concatenate chunks into one buffer and append them to the open file handle. */
  rewrite: (chunks: Chunk[], done: Callback) => void;
  /** In-flight `rewrite`, or `null` when idle. */
  rewritePromise: Promise<void> | null;
  /** Start a standard rotation job. */
  rotate: () => Promise<void>;
  /** Emit `rotated` and reopen the not-rotated file empty. */
  rotated: (filename: string) => Promise<void>;
  /** Instant at which the current rotation job started. */
  rotationTime: Date;
  /** Current size, in bytes, of the file being written. */
  size: number;
  /** Pending interval timer, or `null` when none is scheduled. */
  timeout: NodeJS.Timeout | null;
  /** In-flight interval-driven rotation, or `null` when idle. */
  timeoutPromise: Promise<void> | null;
  /** Ensure the parent path of a rotated name exists via a placeholder create/unlink. */
  touch: (filename: string) => Promise<void>;
  /** Point the not-rotated file name at `filename` via a symbolic link. */
  updateSymLink: () => Promise<void>;
}

/** Strips `private`/`protected` brands so a public test view can re-add those fields. */
type PublicInstance<T> = { [K in keyof T]: T[K] };

/**
 * Test-only view of {@link RotatingFileStream}: widens private fields so tests can
 * inspect them without changing the production public API.
 */
export type TestRotatingFileStream<O extends InternalOptions = InternalOptions> = PublicInstance<RotatingFileStream> &
  PublicRotatingFileStream & { options: O };

/**
 * Unit-test factory for classical rotation: same overloads as the real `createStream`,
 * returning {@link TestRotatingFileStream} so private fields can be inspected.
 */
export function createStream<I extends string = string, MS extends string = string, RS extends string = string>(
  filename: string | ClassicalGenerator,
  options: OptionsWithRotate<I, MS, RS>
): TestRotatingFileStream<InternalOptionsWithRotate>;
/**
 * Unit-test factory for standard rotation: same overloads as the real `createStream`,
 * returning {@link TestRotatingFileStream} so private fields can be inspected.
 */
export function createStream<I extends string = string, MS extends string = string, RS extends string = string>(
  filename: string | StandardGenerator,
  options?: OptionsWithoutRotate<I, MS, RS>
): TestRotatingFileStream<InternalOptionsWithoutRotate>;
/**
 * Implementation of the unit-test `createStream` factory; delegates to the published factory
 * and only widens the returned type.
 */
export function createStream<I extends string = string, MS extends string = string, RS extends string = string>(
  filename: string | Generator,
  options?: Options<I, MS, RS>
) {
  const rfs = originalCreateStream(filename as never, options as never) as unknown as TestRotatingFileStream;

  // Avoids file creation during unit tests.
  rfs._construct = (done: Callback) => process.nextTick(done);

  return rfs;
}
