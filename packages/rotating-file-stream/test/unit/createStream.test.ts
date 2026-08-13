import { resolve, sep } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  type ClassicalGenerator,
  type FileSize,
  type GeneratorArguments,
  type Interval,
  RotatingFileStream,
  RotatingFileStreamError,
  type StandardGenerator
} from "../../index.ts";
import { createStream } from "./helper.ts";

describe("createStream", () => {
  describe("success", () => {
    it("returns a RotatingFileStream / Writable", () => {
      const rfs = createStream("test.log", { mode: Number.parseInt("666", 8) });

      expect(rfs).toBeInstanceOf(RotatingFileStream);
      expect(rfs).toBeInstanceOf(Writable);
      rfs.destroy();
    });

    it("works with no options", () => {
      const rfs = createStream("test.log");

      expect(rfs).toBeInstanceOf(RotatingFileStream);
      rfs.destroy();
    });

    it("uses the standard filename generator", () => {
      const rfs = createStream("test.log");

      expect(rfs.options.generator(null)).toBe("test.log");
      expect(rfs.options.generator({ index: 0, time: new Date("1976-01-23 14:45") })).toBe("19760123-1445-test.log");
      expect(rfs.options.generator({ index: 4, time: new Date("1976-01-23 14:45") })).toBe("19760123-1445-4-test.log");
      rfs.destroy();
    });

    it("adds .gz in the standard generator when compress is enabled", () => {
      const rfs = createStream("test.log", { compress: "gzip" });

      expect(rfs.options.generator({ index: 4, time: new Date("1976-01-23 14:45") })).toBe("19760123-1445-4-test.log.gz");
      rfs.destroy();
    });

    it("omits .gz in the standard generator when omitExtension is set", () => {
      const rfs = createStream("test.log", { compress: "gzip", omitExtension: true });

      expect(rfs.options.generator({ index: 4, time: new Date("1976-01-23 14:45") })).toBe("19760123-1445-4-test.log");
      rfs.destroy();
    });

    it("accepts a custom standard generator function", () => {
      const generator: StandardGenerator = args => (args ? `${args.time.getFullYear()}-${args.index}-custom.log` : "custom.log");
      const rfs = createStream(generator);

      expect(rfs.options.generator).toBe(generator);
      expect(rfs.options.generator(null)).toBe("custom.log");
      expect(rfs.options.generator({ index: 3, time: new Date("1976-01-23 14:45") })).toBe("1976-3-custom.log");
      rfs.destroy();
    });

    it("accepts a custom classical generator function", () => {
      const generator: ClassicalGenerator = index => (index ? `${index}-custom.log` : "custom.log");
      const rfs = createStream(generator, { rotate: 2 });

      expect(rfs.options.generator).toBe(generator);
      expect(rfs.options.generator(null)).toBe("custom.log");
      expect(rfs.options.generator(1)).toBe("1-custom.log");
      rfs.destroy();
    });

    it("parses size and interval into InternalOptions", () => {
      const rfs = createStream("test.log", { interval: "1h", path: "logs", size: "10K" });

      expect(rfs.options.size).toBe(10240);
      expect(rfs.options.interval).toEqual({ num: 1, unit: "h" });
      expect(rfs.options.path).toBe(`logs${sep}`);
      rfs.destroy();
    });

    it("parses byte and gigabyte sizes", () => {
      const bytes = createStream("test.log", { size: "512B" });
      const gigs = createStream("test.log", { size: "1G" });

      expect(bytes.options.size).toBe(512);
      expect(gigs.options.size).toBe(1073741824);
      bytes.destroy();
      gigs.destroy();
    });

    it("parses day and month intervals", () => {
      const days = createStream("test.log", { interval: "2d" });
      const months = createStream("test.log", { interval: "1M" });

      expect(days.options.interval).toEqual({ num: 2, unit: "d" });
      expect(months.options.interval).toEqual({ num: 1, unit: "M" });
      days.destroy();
      months.destroy();
    });

    it("parses maxSize into bytes", () => {
      const rfs = createStream("test.log", { maxFiles: 3, maxSize: "2M" });

      expect(rfs.options.maxFiles).toBe(3);
      expect(rfs.options.maxSize).toBe(2097152);
      rfs.destroy();
    });

    it("uses classical generator when rotate is set", () => {
      const rfs = createStream("test.log", { compress: "gzip", omitExtension: true, rotate: 2 });

      expect(rfs.options.generator(null)).toBe("test.log");
      expect(rfs.options.generator(1)).toBe("test.log.1");
      expect(rfs.options.compress).toBe("gzip");
      rfs.destroy();
    });

    it("adds .gz in classical generator when compress is enabled", () => {
      const rfs = createStream("test.log", { compress: "gzip", rotate: 1 });

      expect(rfs.options.generator(2)).toBe("test.log.2.gz");
      rfs.destroy();
    });

    it("maps compress true to the default external command", () => {
      const rfs = createStream("test.log", { compress: true });

      expect(typeof rfs.options.compress).toBe("function");
      expect((rfs.options.compress as (source: string, dest: string) => string)("a", "b")).toBe("cat a | gzip -c9 > b");
      rfs.destroy();
    });

    it("keeps a custom compress function", () => {
      const compress = (source: string, dest: string): string => `custom ${source} ${dest}`;
      const rfs = createStream("test.log", { compress });

      expect(rfs.options.compress).toBe(compress);
      rfs.destroy();
    });

    it("drops incompatible options for rotate / immutable / missing interval", () => {
      const rotated = createStream("test.log", {
        history:          "h.txt",
        immutable:        true,
        interval:         "1h",
        intervalBoundary: true,
        intervalUTC:      true,
        maxFiles:         2,
        maxSize:          "1K",
        rotate:           1
      });
      const immutable = createStream("test.log", { compress: "gzip", immutable: true, interval: "1h", intervalBoundary: true });
      const symLinkOnly = createStream("test.log", { interval: "1h", symLink: true });
      const noBoundary = createStream("test.log", { initialRotation: true, interval: "1h" });
      const utcWithoutBoundary = createStream("test.log", { interval: "1h", intervalUTC: true });

      expect(rotated.options.rotate).toBe(1);
      expect(rotated.options.history).toBeUndefined();
      expect(rotated.options.immutable).toBeUndefined();
      expect(rotated.options.maxFiles).toBeUndefined();
      expect(immutable.options.compress).toBeUndefined();
      expect(symLinkOnly.options.symLink).toBeUndefined();
      expect(noBoundary.options.initialRotation).toBe(true);
      expect(utcWithoutBoundary.options.intervalUTC).toBeUndefined();
      rotated.destroy();
      immutable.destroy();
      symLinkOnly.destroy();
      noBoundary.destroy();
      utcWithoutBoundary.destroy();
    });

    it("applies documented defaults for mode and encoding", () => {
      const rfs = createStream("test.log");

      expect(rfs.options.mode).toBe(0o666);
      expect(rfs.options.encoding).toBe("utf8");
      rfs.destroy();
    });

    it("keeps explicit mode and encoding values", () => {
      const rfs = createStream("test.log", { encoding: "latin1", mode: 0o600 });

      expect(rfs.options.mode).toBe(0o600);
      expect(rfs.options.encoding).toBe("latin1");
      rfs.destroy();
    });

    it("does not mutate the caller options object", () => {
      const options = { interval: "1d" as const, path: "", rotate: 5 as const, size: "10M" as const };
      const snapshot = { ...options };

      createStream("test.log", options).destroy();

      expect(options).toEqual(snapshot);
    });

    it("stores normalized options on the stream without changing the caller object", () => {
      const input = { interval: "1d" as const, rotate: 5 as const, size: "10M" as const };
      const rfs = createStream("test.log", input);

      expect(rfs.options).toMatchObject({ encoding: "utf8", interval: { num: 1, unit: "d" }, mode: 0o666, path: "", rotate: 5, size: 10485760 });
      expect(typeof rfs.options.generator).toBe("function");
      expect(input).toEqual({ interval: "1d", rotate: 5, size: "10M" });
      rfs.destroy();
    });

    it("leaves path unchanged when it already ends with the separator", () => {
      const rfs = createStream("test.log", { path: `logs${sep}` });

      expect(rfs.options.path).toBe(`logs${sep}`);
      rfs.destroy();
    });

    it("stores an empty path when options.path is omitted", () => {
      const rfs = createStream("test.log");

      expect(rfs.path).toBe("");
      expect(rfs.options.path).toBe("");
      rfs.destroy();
    });

    it("keeps a relative options.path (with trailing separator)", () => {
      const rfs = createStream("test.log", { path: "logs" });

      expect(rfs.path).toBe(`logs${sep}`);
      expect(rfs.options.path).toBe(`logs${sep}`);
      rfs.destroy();
    });

    it("keeps an absolute options.path without rewriting it", () => {
      const absolute = resolve(sep, "tmp", "rfs-absolute-logs");
      const rfs = createStream("test.log", { path: absolute });

      expect(rfs.path).toBe(absolute.endsWith(sep) ? absolute : `${absolute}${sep}`);
      rfs.destroy();
    });

    it("keeps intervalBoundary options when set with interval", () => {
      const rfs = createStream("test.log", { initialRotation: true, interval: "1m", intervalBoundary: true, intervalUTC: true });

      expect(rfs.options.intervalBoundary).toBe(true);
      expect(rfs.options.intervalUTC).toBe(true);
      expect(rfs.options.initialRotation).toBe(true);
      rfs.destroy();
    });
  });

  describe("RotatingFileStreamError", () => {
    it("stores the given message", () => {
      const error = new RotatingFileStreamError("bad generator");

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("bad generator");
    });
  });

  describe("generator validation", () => {
    const expectBadGenerator = (fn: () => unknown, message: string): void => {
      try {
        fn();
        expect.unreachable("expected createStream to throw");
      } catch(error) {
        expect(error).toBeInstanceOf(RotatingFileStreamError);
        expect(error).toMatchObject({ message });
      }
    };

    it("rejects a standard generator with more than one parameter", () => {
      expectBadGenerator(
        () => createStream(((time: Date | null, index?: number) => (time ? `${index}.log` : "a.log")) as never),
        "File name generator must accept exactly one parameter"
      );
    });

    it("rejects a classical generator with more than one parameter", () => {
      expectBadGenerator(
        () => createStream(((index: number | null, extra?: number) => (index ? `${index}-${extra}.log` : "a.log")) as never, { rotate: 2 }),
        "File name generator must accept exactly one parameter"
      );
    });

    it("rejects a standard generator that ignores rotation parameters", () => {
      expectBadGenerator(
        () => createStream((_args: GeneratorArguments | null) => "same.log"),
        "File name generator must return different names for null and for distinct rotation parameters"
      );
    });

    it("rejects a standard generator that ignores time", () => {
      expectBadGenerator(
        () => createStream(args => (args ? `${args.index}.log` : "a.log")),
        "File name generator must return different names for null and for distinct rotation parameters"
      );
    });

    it("rejects a standard generator that ignores index", () => {
      expectBadGenerator(
        () => createStream(args => (args ? `${args.time.getTime()}.log` : "a.log")),
        "File name generator must return different names for null and for distinct rotation parameters"
      );
    });

    it("rejects a classical generator that ignores the rotation index", () => {
      expectBadGenerator(
        () => createStream((_index: number | null) => "same.log", { rotate: 2 }),
        "File name generator must return different names for null and for distinct rotation parameters"
      );
    });

    it("propagates errors thrown by a standard generator during validation", () => {
      const boom = new Error("boom");

      expect(() =>
        createStream(((_args: GeneratorArguments | null) => {
          throw boom;
        }) as StandardGenerator)
      ).toThrow(boom);
    });

    it("propagates errors thrown by a classical generator during validation", () => {
      const boom = new Error("boom");

      expect(() =>
        createStream(
          ((_index: number | null) => {
            throw boom;
          }) as ClassicalGenerator,
          { rotate: 2 }
        )
      ).toThrow(boom);
    });
  });

  describe("wrong calls", () => {
    it("wrong filename type", () => {
      expect(() => createStream({} as string)).toThrow(
        new RotatingFileStreamError("The \"filename\" argument must be one of type string or function. Received type object")
      );
    });

    it("wrong options type", () => {
      expect(() => createStream("test.log", "test.log" as never)).toThrow(
        new RotatingFileStreamError("The \"options\" argument must be of type object. Received type string")
      );
    });

    it("unknown option", () => {
      expect(() => createStream("test.log", { test: true } as never)).toThrow(new RotatingFileStreamError("Unknown option: test"));
    });

    it("no compress value", () => {
      expect(() => createStream("test.log", { compress: undefined })).toThrow(
        new RotatingFileStreamError("A value for 'options.compress' must be specified")
      );
    });

    it("wrong compress type", () => {
      expect(() => createStream("test.log", { compress: 23 as never })).toThrow(
        new RotatingFileStreamError("Don't know how to handle 'options.compress' type: number")
      );
    });

    it("wrong compress method", () => {
      expect(() => createStream("test.log", { compress: "test" as "gzip" })).toThrow(
        new RotatingFileStreamError("Don't know how to handle compression method: test")
      );
    });

    it("wrong interval type", () => {
      expect(() => createStream("test.log", { interval: 23 as never })).toThrow(
        new RotatingFileStreamError("Don't know how to handle 'options.interval' type: number")
      );
    });

    it("wrong path type", () => {
      expect(() => createStream("test.log", { path: 23 as never })).toThrow(
        new RotatingFileStreamError("Don't know how to handle 'options.path' type: number")
      );
    });

    it("wrong size type (number)", () => {
      expect(() => createStream("test.log", { size: 23 as never })).toThrow(
        new RotatingFileStreamError("Don't know how to handle 'options.size' type: number")
      );
    });

    it("wrong size format", () => {
      expect(() => createStream("test.log", { size: "test" as FileSize })).toThrow(
        new RotatingFileStreamError("Unknown 'options.size' format: test")
      );
    });

    it("wrong size number", () => {
      expect(() => createStream("test.log", { size: "-23B" })).toThrow(
        new RotatingFileStreamError("A positive integer number is expected for 'options.size'")
      );
    });

    it("missing size unit", () => {
      expect(() => createStream("test.log", { size: "23" as FileSize })).toThrow(new RotatingFileStreamError("Missing unit for 'options.size'"));
    });

    it("wrong size unit", () => {
      expect(() => createStream("test.log", { size: "23test" as FileSize })).toThrow(new RotatingFileStreamError("Unknown 'options.size' unit: t"));
    });

    it("wrong interval seconds number", () => {
      expect(() => createStream("test.log", { interval: "23s" as Interval })).toThrow(
        new RotatingFileStreamError("An integer divider of 60 is expected as seconds for 'options.interval'")
      );
    });

    it("wrong interval minutes number", () => {
      expect(() => createStream("test.log", { interval: "23m" as Interval })).toThrow(
        new RotatingFileStreamError("An integer divider of 60 is expected as minutes for 'options.interval'")
      );
    });

    it("wrong interval hours number", () => {
      expect(() => createStream("test.log", { interval: "23h" as Interval })).toThrow(
        new RotatingFileStreamError("An integer divider of 24 is expected as hours for 'options.interval'")
      );
    });

    it("string rotate value", () => {
      expect(() => createStream("test.log", { rotate: "test" } as never)).toThrow(
        new RotatingFileStreamError("'rotate' option must be a positive integer number")
      );
    });

    it("negative rotate value", () => {
      expect(() => createStream("test.log", { rotate: -23 })).toThrow(
        new RotatingFileStreamError("'rotate' option must be a positive integer number")
      );
    });

    it("wrong history", () => {
      expect(() => createStream("test.log", { history: {} as never })).toThrow(
        new RotatingFileStreamError("Don't know how to handle 'options.history' type: object")
      );
    });

    it("wrong maxFiles", () => {
      expect(() => createStream("test.log", { maxFiles: {} as never })).toThrow(
        new RotatingFileStreamError("'maxFiles' option must be a positive integer number")
      );
    });

    it("negative maxFiles", () => {
      expect(() => createStream("test.log", { maxFiles: -23 })).toThrow(
        new RotatingFileStreamError("'maxFiles' option must be a positive integer number")
      );
    });

    it("wrong maxSize", () => {
      expect(() => createStream("test.log", { maxSize: "-23B" })).toThrow(
        new RotatingFileStreamError("A positive integer number is expected for 'options.maxSize'")
      );
    });

    it("wrong maxSize type", () => {
      expect(() => createStream("test.log", { maxSize: 23 as never })).toThrow(
        new RotatingFileStreamError("Don't know how to handle 'options.maxSize' type: number")
      );
    });

    it("wrong encoding", () => {
      expect(() => createStream("test.log", { encoding: "test" as BufferEncoding })).toThrow(/encoding is not supported/);
    });

    it("compress false is accepted", () => {
      const rfs = createStream("test.log", { compress: false });

      expect(rfs.options.compress).toBe(false);
      rfs.destroy();
    });
  });
});
