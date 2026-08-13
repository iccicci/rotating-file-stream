import type { AppenderModule } from "log4js";
import { describe, expectTypeOf, test } from "vitest";

import rotatingFileStream4js, {
  type ClassicalGenerator,
  configure,
  createStream,
  type GeneratorArguments,
  type RfsOptions,
  type RfsOptionsWithoutRotate,
  type RfsOptionsWithRotate,
  type RotatingFileStream,
  type RotatingFileStream4jsAppender,
  RotatingFileStream4jsError,
  shareStream,
  type StandardGenerator
} from "../../index.ts";

describe("rotating-file-stream-4js types", () => {
  test("default export is an AppenderModule", () => {
    expectTypeOf(rotatingFileStream4js).toExtend<AppenderModule>();
    expectTypeOf(rotatingFileStream4js.configure).toEqualTypeOf<AppenderModule["configure"]>();
    expectTypeOf(configure).toEqualTypeOf<AppenderModule["configure"]>();
  });

  test("re-exports rotating-file-stream createStream and RotatingFileStream", () => {
    expectTypeOf(createStream).toBeFunction();
    expectTypeOf(createStream("file.log")).toEqualTypeOf<RotatingFileStream>();
  });

  test("RfsOptionsWithoutRotate accepts a standard generator", () => {
    const filename: StandardGenerator = (args: GeneratorArguments | null) => (args ? `${args.index}.log` : "file.log");
    const options: RfsOptionsWithoutRotate = {
      filename,
      onStream: (resolved: RotatingFileStream) => {
        expectTypeOf(resolved).toEqualTypeOf<RotatingFileStream>();
      },
      options: { size: "10M" }
    };

    expectTypeOf(options).toExtend<RfsOptions>();
    expectTypeOf(options.filename).toEqualTypeOf<string | StandardGenerator>();
  });

  test("RfsOptionsWithRotate accepts a classical generator", () => {
    const filename: ClassicalGenerator = (index: number | null) => (index === null ? "file.log" : `file.${index}.log`);
    const options: RfsOptionsWithRotate = {
      filename,
      options: { rotate: 5, size: "10M" }
    };

    expectTypeOf(options).toExtend<RfsOptions>();
    expectTypeOf(options.filename).toEqualTypeOf<string | ClassicalGenerator>();
    expectTypeOf(options.options.rotate).toEqualTypeOf<number>();
  });

  test("RfsOptions rejects a classical generator without rotate", () => {
    const filename: ClassicalGenerator = (index: number | null) => (index === null ? "file.log" : `file.${index}.log`);

    // @ts-expect-error classical generators require options.rotate
    const options: RfsOptions = { filename, options: { size: "10M" } };

    expectTypeOf(options).toExtend<RfsOptions>();
  });

  test("RfsOptions rejects a standard generator with rotate", () => {
    const filename: StandardGenerator = (args: GeneratorArguments | null) => (args ? `${args.index}.log` : "file.log");

    // @ts-expect-error standard generators cannot use options.rotate
    const options: RfsOptions = { filename, options: { rotate: 5 } };

    expectTypeOf(options).toExtend<RfsOptions>();
  });

  test("shareStream returns an AppenderModule and takes only the stream", () => {
    const stream = createStream("file.log");

    expectTypeOf(shareStream).toEqualTypeOf<(stream: RotatingFileStream) => AppenderModule>();
    expectTypeOf(shareStream(stream)).toExtend<AppenderModule>();
  });

  test("appender config accepts rfs", () => {
    const config: RotatingFileStream4jsAppender = {
      rfs:  { filename: "file.log", options: { size: "10M" } },
      type: "rotating-file-stream-4js"
    };

    expectTypeOf(config.rfs).toEqualTypeOf<RfsOptions>();
    expectTypeOf(new RotatingFileStream4jsError("x")).toExtend<Error>();
  });
});
