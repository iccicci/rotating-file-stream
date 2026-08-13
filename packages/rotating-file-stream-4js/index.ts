import { EOL } from "node:os";

import type { AppenderFunction, AppenderModule, Layout, LayoutFunction, LayoutsParam, LoggingEvent, PatternToken } from "log4js";
import type {
  ClassicalGenerator,
  Generator,
  Options,
  OptionsWithoutRotate,
  OptionsWithRotate,
  StandardGenerator
} from "rotating-file-stream";
import { createStream, RotatingFileStream } from "rotating-file-stream";

export * from "rotating-file-stream";

/**
 * Error thrown by the package for library-originated failures (invalid configuration and similar).
 * Errors from `rotating-file-stream` or Node.js APIs are not wrapped.
 */
export class RotatingFileStream4jsError extends Error {}

type RfsOnStream = {
  /** Called synchronously with the opened stream so listeners can be attached before any write. */
  onStream?: (stream: RotatingFileStream) => void;
};

/**
 * `rfs` options for classical UNIX logrotate mode (`options.rotate`).
 *
 * Mirrors the {@link createStream} overload that takes a {@link ClassicalGenerator}.
 */
export type RfsOptionsWithRotate<I extends string = string, MS extends string = string, RS extends string = string> = RfsOnStream & {
  filename: string | ClassicalGenerator;
  options: OptionsWithRotate<I, MS, RS>;
};

/**
 * `rfs` options for standard rotation (no `options.rotate`).
 *
 * Mirrors the {@link createStream} overload that takes a {@link StandardGenerator}.
 */
export type RfsOptionsWithoutRotate<I extends string = string, MS extends string = string, RS extends string = string> = RfsOnStream & {
  filename: string | StandardGenerator;
  options?: OptionsWithoutRotate<I, MS, RS>;
};

/**
 * Rotating-file-stream options nested under the log4js appender `rfs` field.
 *
 * Discriminated like {@link createStream}: with `options.rotate` the filename generator must be
 * classical; without it, standard. Used when the appender opens the file itself. With
 * {@link shareStream}, `rfs` is not required.
 */
export type RfsOptions<I extends string = string, MS extends string = string, RS extends string = string> =
  RfsOptionsWithRotate<I, MS, RS> | RfsOptionsWithoutRotate<I, MS, RS>;

/**
 * log4js appender configuration for this package.
 *
 * All standard log4js appender fields remain valid; `rfs` is required when calling
 * {@link configure} directly. With {@link shareStream}, `rfs` may be omitted because the stream
 * is already bound; each appender entry can still set its own `layout` and `timezoneOffset`.
 */
export interface RotatingFileStream4jsAppender<I extends string = string, MS extends string = string, RS extends string = string> {
  type: "rotating-file-stream-4js" | AppenderModule;
  /** Defaults to log4js `basicLayout` when omitted. */
  layout?: Layout;
  /** Forwarded to the layout function, matching core log4js file/stdout appenders. */
  timezoneOffset?: number;
  /** rotating-file-stream-4js options. */
  rfs: RfsOptions<I, MS, RS>;
}

type LayoutWithOffset = (loggingEvent: LoggingEvent, timezoneOffset?: number) => string;

type AppenderWithShutdown = AppenderFunction & {
  shutdown?: (done: (error?: Error) => void) => void;
};

const RFS_KEYS = new Set(["filename", "onStream", "options"]);

const isPlainObject = (value: unknown): value is { [key: string]: unknown } => typeof value === "object" && value !== null;

/** Validate and narrow an unknown value to {@link RfsOptions}. */
// eslint-disable-next-line func-style -- TypeScript assertion functions must be function declarations
function assertIsRfsOptions(rfs: unknown): asserts rfs is RfsOptions {
  if(! isPlainObject(rfs)) throw new RotatingFileStream4jsError(`The "rfs" option must be of type object. Received type ${typeof rfs}`);

  for(const key of Object.keys(rfs)) if(! RFS_KEYS.has(key)) throw new RotatingFileStream4jsError(`Unknown 'rfs' option: ${key}`);

  const { filename, onStream, options } = rfs;

  if(filename === undefined) throw new RotatingFileStream4jsError("Missing required \"rfs.filename\" option");

  if(typeof filename !== "string" && typeof filename !== "function")
    throw new RotatingFileStream4jsError(`The "rfs.filename" option must be of type string or function. Received type ${typeof filename}`);

  if(options !== undefined && ! isPlainObject(options))
    throw new RotatingFileStream4jsError(`The "rfs.options" option must be of type object. Received type ${typeof options}`);

  if(onStream !== undefined && typeof onStream !== "function")
    throw new RotatingFileStream4jsError(`The "rfs.onStream" option must be of type function. Received type ${typeof onStream}`);
}

/** Validate `rfs` and open a stream owned by the appender. */
const openStream = (rfs: unknown): RotatingFileStream => {
  assertIsRfsOptions(rfs);

  const { filename, onStream, options } = rfs;
  const open = createStream as (filename: string | Generator, options?: Options) => RotatingFileStream;
  const stream = open(filename, options);

  if(onStream !== undefined) onStream(stream);

  return stream;
};

/** Resolve a log4js layout from the appender `layout` option. */
const getLayout = (layout: unknown, layouts: LayoutsParam): LayoutWithOffset => {
  if(! isPlainObject(layout)) throw new RotatingFileStream4jsError(`The 'layout' option must be of type object. Received type ${typeof layout}`);

  if(typeof layout.type !== "string")
    throw new RotatingFileStream4jsError(`The 'layout.type' option must be of type string. Received type ${typeof layout.type}`);

  return layouts.layout(layout.type, layout as unknown as PatternToken);
};

/**
 * Build a log4js `configure` function.
 *
 * When `sharedStream` is omitted, the returned configure reads and validates `rfs` and opens a
 * stream. When `sharedStream` is set, `rfs` is ignored and that stream is used.
 */
const createConfigure =
  (sharedStream?: RotatingFileStream): AppenderModule["configure"] =>
    (config, layouts) => {
      if(! isPlainObject(config))
        throw new RotatingFileStream4jsError(`The appender configuration must be of type object. Received type ${typeof config}`);

      if(! isPlainObject(layouts) || typeof layouts.basicLayout !== "function")
        throw new RotatingFileStream4jsError("The 'layouts' argument must be the log4js layouts module");

      if(sharedStream === undefined && config.rfs === undefined) throw new RotatingFileStream4jsError("Missing required 'rfs' option");

      const layout = config.layout === undefined ? layouts.basicLayout : getLayout(config.layout, layouts);
      const stream = sharedStream !== undefined ? sharedStream : openStream(config.rfs);
      const { timezoneOffset } = config;

      if(timezoneOffset !== undefined && typeof timezoneOffset !== "number")
        throw new RotatingFileStream4jsError(`The 'timezoneOffset' option must be of type number. Received type ${typeof timezoneOffset}`);

      const appender: AppenderWithShutdown = loggingEvent => {
        stream.write(`${layout(loggingEvent, timezoneOffset)}${EOL}`);
      };

      appender.shutdown = done => {
        stream.end(done);
      };

      return appender;
    };

/**
 * Configure a log4js appender that opens its own {@link RotatingFileStream} from `rfs`.
 *
 * @param config - Appender configuration; must include {@link RotatingFileStream4jsAppender.rfs}.
 * @param layouts - log4js layouts module passed by `log4js.configure`.
 */
export const configure = createConfigure();

/**
 * Bind an existing {@link RotatingFileStream} into a log4js appender module.
 *
 * `log4js.configure` deep-clones its configuration, so a live stream must not be placed in the
 * config object itself. Pass the returned module as `type` instead. Each appender entry can still
 * set its own `layout` and `timezoneOffset`.
 */
export const shareStream = (stream: RotatingFileStream): AppenderModule => {
  if(! (stream instanceof RotatingFileStream)) throw new RotatingFileStream4jsError("The 'stream' argument must be a RotatingFileStream instance");

  return { configure: createConfigure(stream) };
};

/** Appender module object accepted by log4js as `type: rotatingFileStream4js`. */
const rotatingFileStream4js: AppenderModule = { configure };

export default rotatingFileStream4js;

export type { AppenderFunction, Layout, LayoutFunction, LayoutsParam, LoggingEvent };
