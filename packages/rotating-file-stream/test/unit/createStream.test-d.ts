import { type FileHandle } from "node:fs/promises";
import { type Readable } from "node:stream";

import { describe, expectTypeOf, test } from "vitest";

import {
  type Callback,
  type Chunk,
  type ClassicalGenerator,
  createStream as publicCreateStream,
  type Generator,
  type GeneratorArguments,
  type InternalOptionsWithoutRotate,
  type InternalOptionsWithRotate,
  type RotatingFileStream,
  type StandardGenerator
} from "../../index.ts";
import { createStream, type TestRotatingFileStream } from "./helper.ts";

describe("createStream types", () => {
  test("public API does not expose generator or options without rotate", () => {
    const rfs = publicCreateStream("test.log");

    expectTypeOf(rfs).toEqualTypeOf<RotatingFileStream>();
    expectTypeOf(rfs).not.toHaveProperty("closeHandle");
    expectTypeOf(rfs).not.toHaveProperty("classical");
    expectTypeOf(rfs).not.toHaveProperty("clear");
    expectTypeOf(rfs).not.toHaveProperty("filename");
    expectTypeOf(rfs).not.toHaveProperty("findName");
    expectTypeOf(rfs).not.toHaveProperty("generator");
    expectTypeOf(rfs).not.toHaveProperty("getFileName");
    expectTypeOf(rfs).not.toHaveProperty("handle");
    expectTypeOf(rfs).not.toHaveProperty("history");
    expectTypeOf(rfs).not.toHaveProperty("immutable");
    expectTypeOf(rfs).not.toHaveProperty("interval");
    expectTypeOf(rfs).not.toHaveProperty("intervalBounds");
    expectTypeOf(rfs).not.toHaveProperty("intervalBoundsBig");
    expectTypeOf(rfs).not.toHaveProperty("last");
    expectTypeOf(rfs).not.toHaveProperty("maxTimeout");
    expectTypeOf(rfs).not.toHaveProperty("move");
    expectTypeOf(rfs).not.toHaveProperty("next");
    expectTypeOf(rfs).not.toHaveProperty("now");
    expectTypeOf(rfs).not.toHaveProperty("options");
    expectTypeOf(rfs).not.toHaveProperty("path");
    expectTypeOf(rfs).not.toHaveProperty("prev");
    expectTypeOf(rfs).not.toHaveProperty("refinal");
    expectTypeOf(rfs).not.toHaveProperty("reopen");
    expectTypeOf(rfs).not.toHaveProperty("rewrite");
    expectTypeOf(rfs).not.toHaveProperty("rewritePromise");
    expectTypeOf(rfs).not.toHaveProperty("rotate");
    expectTypeOf(rfs).not.toHaveProperty("rotated");
    expectTypeOf(rfs).not.toHaveProperty("rotationTime");
    expectTypeOf(rfs).not.toHaveProperty("size");
    expectTypeOf(rfs).not.toHaveProperty("timeout");
    expectTypeOf(rfs).not.toHaveProperty("timeoutPromise");
    expectTypeOf(rfs).not.toHaveProperty("touch");
    expectTypeOf(rfs).not.toHaveProperty("updateSymLink");
  });

  test("public API does not expose generator or options with rotate", () => {
    const rfs = publicCreateStream("test.log", { rotate: 2 });

    expectTypeOf(rfs).toEqualTypeOf<RotatingFileStream>();
    expectTypeOf(rfs).not.toHaveProperty("closeHandle");
    expectTypeOf(rfs).not.toHaveProperty("classical");
    expectTypeOf(rfs).not.toHaveProperty("clear");
    expectTypeOf(rfs).not.toHaveProperty("filename");
    expectTypeOf(rfs).not.toHaveProperty("findName");
    expectTypeOf(rfs).not.toHaveProperty("generator");
    expectTypeOf(rfs).not.toHaveProperty("getFileName");
    expectTypeOf(rfs).not.toHaveProperty("handle");
    expectTypeOf(rfs).not.toHaveProperty("history");
    expectTypeOf(rfs).not.toHaveProperty("immutable");
    expectTypeOf(rfs).not.toHaveProperty("interval");
    expectTypeOf(rfs).not.toHaveProperty("intervalBounds");
    expectTypeOf(rfs).not.toHaveProperty("intervalBoundsBig");
    expectTypeOf(rfs).not.toHaveProperty("last");
    expectTypeOf(rfs).not.toHaveProperty("maxTimeout");
    expectTypeOf(rfs).not.toHaveProperty("move");
    expectTypeOf(rfs).not.toHaveProperty("next");
    expectTypeOf(rfs).not.toHaveProperty("now");
    expectTypeOf(rfs).not.toHaveProperty("options");
    expectTypeOf(rfs).not.toHaveProperty("path");
    expectTypeOf(rfs).not.toHaveProperty("prev");
    expectTypeOf(rfs).not.toHaveProperty("refinal");
    expectTypeOf(rfs).not.toHaveProperty("reopen");
    expectTypeOf(rfs).not.toHaveProperty("rewrite");
    expectTypeOf(rfs).not.toHaveProperty("rewritePromise");
    expectTypeOf(rfs).not.toHaveProperty("rotate");
    expectTypeOf(rfs).not.toHaveProperty("rotated");
    expectTypeOf(rfs).not.toHaveProperty("rotationTime");
    expectTypeOf(rfs).not.toHaveProperty("size");
    expectTypeOf(rfs).not.toHaveProperty("timeout");
    expectTypeOf(rfs).not.toHaveProperty("timeoutPromise");
    expectTypeOf(rfs).not.toHaveProperty("touch");
    expectTypeOf(rfs).not.toHaveProperty("updateSymLink");
  });

  test("helper createStream exposes StandardGenerator without rotate", () => {
    const rfs = createStream("test.log");

    expectTypeOf(rfs).toEqualTypeOf<TestRotatingFileStream<InternalOptionsWithoutRotate>>();
    expectTypeOf(rfs.options.generator).toEqualTypeOf<StandardGenerator>();
    expectTypeOf(rfs.path).toBeString();
    expectTypeOf(rfs.filename).toBeString();
    expectTypeOf(rfs.handle).toEqualTypeOf<FileHandle | null>();
    expectTypeOf(rfs.classical).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(rfs.clear).toEqualTypeOf<() => void>();
    expectTypeOf(rfs.closeHandle).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(rfs.findName).toEqualTypeOf<() => Promise<string>>();
    expectTypeOf(rfs.history).toEqualTypeOf<(filename: string) => Promise<void>>();
    expectTypeOf(rfs.immutable).toEqualTypeOf<(first: boolean) => Promise<void>>();
    expectTypeOf(rfs.interval).toEqualTypeOf<() => void>();
    expectTypeOf(rfs.intervalBounds).toEqualTypeOf<(now: Date) => Date>();
    expectTypeOf(rfs.intervalBoundsBig).toEqualTypeOf<(now: Date) => void>();
    expectTypeOf(rfs.last).toBeString();
    expectTypeOf(rfs.maxTimeout).toBeNumber();
    expectTypeOf(rfs.move).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(rfs.next).toBeNumber();
    expectTypeOf(rfs.now).toEqualTypeOf<() => Date>();
    expectTypeOf(rfs.prev).toBeNumber();
    expectTypeOf(rfs.refinal).toEqualTypeOf<(error: Error | null, done: Callback) => Promise<void>>();
    expectTypeOf(rfs.reopen).toEqualTypeOf<(size: number) => Promise<void>>();
    expectTypeOf(rfs.rewrite).toEqualTypeOf<(chunks: Chunk[], done: Callback) => void>();
    expectTypeOf(rfs.rewritePromise).toEqualTypeOf<Promise<void> | null>();
    expectTypeOf(rfs.rotate).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(rfs.rotated).toEqualTypeOf<(filename: string) => Promise<void>>();
    expectTypeOf(rfs.rotationTime).toEqualTypeOf<Date>();
    expectTypeOf(rfs.size).toBeNumber();
    expectTypeOf(rfs.timeout).toEqualTypeOf<NodeJS.Timeout | null>();
    expectTypeOf(rfs.timeoutPromise).toEqualTypeOf<Promise<void> | null>();
    expectTypeOf(rfs.touch).toEqualTypeOf<(filename: string) => Promise<void>>();
    expectTypeOf(rfs.updateSymLink).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(rfs.getFileName).toEqualTypeOf<(index?: number) => string>();
    expectTypeOf(rfs.options.generator(null)).toBeString();
    expectTypeOf(rfs.options.generator({ index: 1, time: new Date() })).toBeString();
  });

  test("helper createStream exposes ClassicalGenerator with rotate", () => {
    const rfs = createStream("test.log", { rotate: 2 });

    expectTypeOf(rfs).toEqualTypeOf<TestRotatingFileStream<InternalOptionsWithRotate>>();
    expectTypeOf(rfs.options.generator).toEqualTypeOf<ClassicalGenerator>();
    expectTypeOf(rfs.options.generator(null)).toBeString();
    expectTypeOf(rfs.options.generator(1)).toBeString();
  });

  test("custom StandardGenerator is accepted without rotate", () => {
    const generator: StandardGenerator = args => (args ? `${args.index}.log` : "test.log");
    const rfs = createStream(generator, { size: "10M" });

    expectTypeOf(rfs.options.generator).toEqualTypeOf<StandardGenerator>();
  });

  test("custom ClassicalGenerator is accepted with rotate", () => {
    const generator: ClassicalGenerator = index => (index ? `${index}.log` : "test.log");
    const rfs = createStream(generator, { rotate: 3, size: "10M" });

    expectTypeOf(rfs.options.generator).toEqualTypeOf<ClassicalGenerator>();
  });

  test("GeneratorArguments requires both time and index", () => {
    expectTypeOf<GeneratorArguments>().toEqualTypeOf<{ index: number; time: Date }>();
  });

  test("Generator is the union of both generators", () => {
    expectTypeOf<Generator>().toEqualTypeOf<ClassicalGenerator | StandardGenerator>();
  });

  test("ClassicalGenerator is rejected without rotate", () => {
    const generator: ClassicalGenerator = index => (index ? `${index}.log` : "test.log");

    // @ts-expect-error classical generator requires options.rotate
    createStream(generator);
  });

  test("StandardGenerator is rejected with rotate", () => {
    const generator: StandardGenerator = args => (args ? `${args.index}.log` : "test.log");

    // @ts-expect-error standard generator cannot be used with options.rotate
    createStream(generator, { rotate: 1 });
  });

  test("Writable and RotatingFileStream events are typed", () => {
    const rfs = publicCreateStream("test.log");

    rfs.on("close", () => undefined);
    rfs.on("error", err => {
      expectTypeOf(err).toEqualTypeOf<Error>();
    });
    rfs.on("pipe", src => {
      expectTypeOf(src).toEqualTypeOf<Readable>();
    });
    rfs.on("open", filename => {
      expectTypeOf(filename).toBeString();
    });
    rfs.on("removed", (filename, number) => {
      expectTypeOf(filename).toBeString();
      expectTypeOf(number).toBeBoolean();
    });
    rfs.on("external", (stdout, stderr) => {
      expectTypeOf(stdout).toBeString();
      expectTypeOf(stderr).toBeString();
    });
    rfs.on("newListener", (eventName, listener) => {
      expectTypeOf(eventName).toEqualTypeOf<string | symbol>();
      expectTypeOf(listener).toEqualTypeOf<(...args: any[]) => void>();
    });
    rfs.on("removeListener", (eventName, listener) => {
      expectTypeOf(eventName).toEqualTypeOf<string | symbol>();
      expectTypeOf(listener).toEqualTypeOf<(...args: any[]) => void>();
    });
    rfs.emit("close");
    rfs.emit("open", "test.log");
    rfs.emit("rotated", "test.log");
    rfs.listenerCount("error");
    rfs.listeners("open");
    rfs.rawListeners("close");
    rfs.removeAllListeners("warning");
    rfs.eventNames();
    rfs.getMaxListeners();
    rfs.setMaxListeners(10);
  });
});
