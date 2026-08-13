import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import type { AppenderFunction, LayoutsParam, LoggingEvent } from "log4js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { configure, createStream, RotatingFileStream, RotatingFileStream4jsError, shareStream } from "../../index.ts";

type AppenderWithShutdown = AppenderFunction & {
  shutdown?: (done: (error?: Error) => void) => void;
};

const layouts = {
  basicLayout: (event: LoggingEvent) => `BASIC ${event.data.join(" ")}`,
  layout:      (type: string) => (event: LoggingEvent) => `${type.toUpperCase()} ${event.data.join(" ")}`
} as unknown as LayoutsParam;

const event = (message: string): LoggingEvent =>
  ({
    categoryName: "default",
    data:         [message],
    level:        { level: 20000, levelStr: "INFO" },
    startTime:    new Date()
  }) as LoggingEvent;

describe("configure", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while(dirs.length) {
      const dir = dirs.pop();

      if(dir) rmSync(dir, { force: true, recursive: true });
    }
  });

  const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "rfs4js-"));

    dirs.push(dir);

    return dir;
  };

  it("rejects a non-object configuration", () => {
    expect(() => configure("nope", layouts)).toThrow(
      new RotatingFileStream4jsError("The appender configuration must be of type object. Received type string")
    );
  });

  it("rejects a missing layouts module", () => {
    expect(() => configure({ rfs: { filename: "x.log" } }, null as never)).toThrow(
      new RotatingFileStream4jsError("The 'layouts' argument must be the log4js layouts module")
    );
  });

  it("rejects a missing rfs option", () => {
    expect(() => configure({}, layouts)).toThrow(new RotatingFileStream4jsError("Missing required 'rfs' option"));
  });

  it("rejects a non-object rfs option", () => {
    expect(() => configure({ rfs: "nope" }, layouts)).toThrow(
      new RotatingFileStream4jsError("The \"rfs\" option must be of type object. Received type string")
    );
  });

  it("rejects unknown rfs keys", () => {
    expect(() => configure({ rfs: { extra: true, filename: "x.log" } }, layouts)).toThrow(
      new RotatingFileStream4jsError("Unknown 'rfs' option: extra")
    );
  });

  it("rejects rfs without filename", () => {
    expect(() => configure({ rfs: {} }, layouts)).toThrow(
      new RotatingFileStream4jsError("Missing required \"rfs.filename\" option")
    );
  });

  it("rejects a non-string non-function filename", () => {
    expect(() => configure({ rfs: { filename: 1 as never } }, layouts)).toThrow(
      new RotatingFileStream4jsError("The \"rfs.filename\" option must be of type string or function. Received type number")
    );
  });

  it("rejects a non-object options option", () => {
    expect(() => configure({ rfs: { filename: "x.log", options: "nope" as never } }, layouts)).toThrow(
      new RotatingFileStream4jsError("The \"rfs.options\" option must be of type object. Received type string")
    );
  });

  it("rejects a non-function onStream before opening a stream", () => {
    try {
      expect(() => configure({ rfs: { filename: "x.log", onStream: 1 } }, layouts)).toThrow(
        new RotatingFileStream4jsError("The \"rfs.onStream\" option must be of type function. Received type number")
      );
    } finally {
      rmSync("x.log", { force: true });
    }
  });

  it("rejects a non-object layout option", () => {
    const dir = tempDir();

    expect(() => configure({ layout: "basic", rfs: { filename: "test.log", options: { path: dir } } }, layouts)).toThrow(
      new RotatingFileStream4jsError("The 'layout' option must be of type object. Received type string")
    );
  });

  it("rejects a layout without a string type", () => {
    const dir = tempDir();

    expect(() => configure({ layout: { type: 1 }, rfs: { filename: "test.log", options: { path: dir } } }, layouts)).toThrow(
      new RotatingFileStream4jsError("The 'layout.type' option must be of type string. Received type number")
    );
  });

  it("rejects a non-number timezoneOffset", () => {
    const dir = tempDir();

    expect(() =>
      configure({ rfs: { filename: "test.log", options: { path: dir } }, timezoneOffset: "0" }, layouts)
    ).toThrow(new RotatingFileStream4jsError("The 'timezoneOffset' option must be of type number. Received type string"));
  });

  it("writes with basicLayout by default", async () => {
    const dir = tempDir();
    const appender = configure({ rfs: { filename: "owned.log", options: { path: dir } } }, layouts) as AppenderWithShutdown;

    appender(event("hello"));

    await new Promise<void>((resolve, reject) => {
      appender.shutdown!(error => (error ? reject(error) : resolve()));
    });

    expect(readFileSync(join(dir, "owned.log"), "utf8")).toContain("BASIC hello");
  });

  it("uses a custom layout when configured", async () => {
    const dir = tempDir();
    const appender = configure(
      { layout: { type: "pattern" }, rfs: { filename: "custom.log", options: { path: dir } } },
      layouts
    ) as AppenderWithShutdown;

    appender(event("line"));

    await new Promise<void>((resolve, reject) => {
      appender.shutdown!(error => (error ? reject(error) : resolve()));
    });

    expect(readFileSync(join(dir, "custom.log"), "utf8")).toContain("PATTERN line");
  });

  it("calls onStream synchronously with the resolved stream", async () => {
    const dir = tempDir();
    const seen: RotatingFileStream[] = [];
    const appender = configure(
      {
        rfs: {
          filename: "on.log",
          onStream: (stream: RotatingFileStream) => {
            seen.push(stream);
            stream.on("rotated", () => undefined);
          },
          options: { path: dir }
        }
      },
      layouts
    ) as AppenderWithShutdown;

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(RotatingFileStream);

    await new Promise<void>((resolve, reject) => {
      appender.shutdown!(error => (error ? reject(error) : resolve()));
    });
  });

  it("forwards timezoneOffset to the layout", async () => {
    const dir = tempDir();
    const layout = vi.fn((loggingEvent: LoggingEvent, offset?: number) => `OFFSET ${offset} ${loggingEvent.data[0]}`);
    const customLayouts = {
      basicLayout: layout,
      layout:      () => layout
    } as unknown as LayoutsParam;

    const appender = configure(
      { rfs: { filename: "tz.log", options: { path: dir } }, timezoneOffset: 120 },
      customLayouts
    ) as AppenderWithShutdown;

    appender(event("tz"));

    expect(layout).toHaveBeenCalledWith(expect.objectContaining({ data: ["tz"] }), 120);

    await new Promise<void>((resolve, reject) => {
      appender.shutdown!(error => (error ? reject(error) : resolve()));
    });
  });

  it("shareStream binds a live stream", async () => {
    const dir = tempDir();
    const stream = createStream("bound.log", { path: dir });

    await new Promise<void>(resolve => stream.once("open", () => resolve()));

    const appender = shareStream(stream).configure({}, layouts) as AppenderWithShutdown;

    appender(event("bound"));

    await new Promise<void>((resolve, reject) => {
      appender.shutdown!(error => (error ? reject(error) : resolve()));
    });

    expect(readFileSync(join(dir, "bound.log"), "utf8")).toContain("BASIC bound");
  });

  it("shareStream lets each appender use its own layout", async () => {
    const dir = tempDir();
    const stream = createStream("layouts.log", { path: dir });

    await new Promise<void>(resolve => stream.once("open", () => resolve()));

    const shared = shareStream(stream);
    const basic = shared.configure({}, layouts) as AppenderWithShutdown;
    const patterned = shared.configure({ layout: { type: "pattern" } }, layouts) as AppenderWithShutdown;

    basic(event("one"));
    patterned(event("two"));

    await new Promise<void>((resolve, reject) => {
      basic.shutdown!(error => (error ? reject(error) : resolve()));
    });

    const content = readFileSync(join(dir, "layouts.log"), "utf8");

    expect(content).toContain("BASIC one");
    expect(content).toContain("PATTERN two");
  });

  it("shareStream ignores rfs on the appender config", async () => {
    const dir = tempDir();
    const stream = createStream("ignore-rfs.log", { path: dir });

    await new Promise<void>(resolve => stream.once("open", () => resolve()));

    const appender = shareStream(stream).configure(
      { rfs: { filename: "unused.log", options: { path: dir } } },
      layouts
    ) as AppenderWithShutdown;

    appender(event("kept"));

    await new Promise<void>((resolve, reject) => {
      appender.shutdown!(error => (error ? reject(error) : resolve()));
    });

    expect(readFileSync(join(dir, "ignore-rfs.log"), "utf8")).toContain("BASIC kept");
  });

  it("shareStream rejects a non-RotatingFileStream", () => {
    expect(() => shareStream(new Writable() as never)).toThrow(
      new RotatingFileStream4jsError("The 'stream' argument must be a RotatingFileStream instance")
    );
  });
});
