import { sep } from "node:path";

import { describe, expect, it } from "vitest";

import { type ClassicalGenerator, type GeneratorArguments, type StandardGenerator } from "../../index.ts";
import { createStream } from "./helper.ts";

describe("getFileName", () => {
  it("returns the not-rotated name under options.path when index is omitted", () => {
    const rfs = createStream("test.log");

    expect(rfs.getFileName()).toBe("test.log");
    rfs.destroy();
  });

  it("calls the standard generator with rotationTime and index", () => {
    const time = new Date("1976-01-23 14:45");
    const generator: StandardGenerator = args => (! args ? "live.log" : `${args.time.toISOString()}-${args.index}.log`);
    const rfs = createStream(generator);

    rfs.rotationTime = time;

    expect(rfs.getFileName()).toBe(`${rfs.path}live.log`);
    expect(rfs.getFileName(0)).toBe(`${rfs.path}${time.toISOString()}-0.log`);
    expect(rfs.getFileName(4)).toBe(`${rfs.path}${time.toISOString()}-4.log`);
    rfs.destroy();
  });

  it("omits index 0 from the default standard generator name", () => {
    const rfs = createStream("test.log");

    rfs.rotationTime = new Date("1976-01-23 14:45");

    expect(rfs.getFileName(0)).toBe(`${rfs.path}19760123-1445-test.log`);
    expect(rfs.getFileName(4)).toBe(`${rfs.path}19760123-1445-4-test.log`);
    rfs.destroy();
  });

  it("calls the classical generator with the rotation index", () => {
    const generator: ClassicalGenerator = index => (index === null ? "live.log" : `${index}.log`);
    const rfs = createStream(generator, { rotate: 2 });

    expect(rfs.getFileName()).toBe(`${rfs.path}live.log`);
    expect(rfs.getFileName(1)).toBe(`${rfs.path}1.log`);
    expect(rfs.getFileName(2)).toBe(`${rfs.path}2.log`);
    rfs.destroy();
  });

  it("uses the default classical generator under options.path", () => {
    const rfs = createStream("test.log", { compress: "gzip", path: "logs", rotate: 2 });

    expect(rfs.path).toBe(`logs${sep}`);
    expect(rfs.getFileName()).toBe(`logs${sep}test.log`);
    expect(rfs.getFileName(1)).toBe(`logs${sep}test.log.1.gz`);
    rfs.destroy();
  });

  it("passes GeneratorArguments with both time and index to a custom standard generator", () => {
    const time = new Date("2015-03-29 01:29:23");
    const seen: (GeneratorArguments | null)[] = [];
    const generator: StandardGenerator = args => {
      seen.push(args);

      return ! args ? "a.log" : `${args.time.getFullYear()}-${args.index}.log`;
    };
    const rfs = createStream(generator);

    seen.length = 0;
    rfs.rotationTime = time;
    rfs.getFileName();
    rfs.getFileName(1);

    expect(seen).toEqual([null, { index: 1, time }]);
    rfs.destroy();
  });

  describe("intervalBoundary", () => {
    it("uses rotationTime when interval is set but intervalBoundary is not", () => {
      const rotationTime = new Date("2015-03-29 01:29:23");
      const seen: (GeneratorArguments | null)[] = [];
      const generator: StandardGenerator = args => {
        seen.push(args);

        return ! args ? "a.log" : `${args.time.toISOString()}-${args.index}.log`;
      };
      const rfs = createStream(generator, { interval: "1d" });

      seen.length = 0; // discard calls made by createStream during generator validation
      rfs.intervalBounds(rotationTime);
      rfs.rotationTime = rotationTime;
      rfs.getFileName(0);

      expect(seen).toEqual([{ index: 0, time: rotationTime }]);
      rfs.destroy();
    });

    it("uses rotationTime when intervalBoundary is set but interval is not", () => {
      const rotationTime = new Date("2015-03-29 01:29:23");
      const seen: (GeneratorArguments | null)[] = [];
      const generator: StandardGenerator = args => {
        seen.push(args);

        return ! args ? "a.log" : `${args.time.toISOString()}-${args.index}.log`;
      };
      // intervalBoundary without interval: createStream strips intervalBoundary from options,
      // so options.intervalBoundary will be undefined; rotationTime must be used.
      const rfs = createStream(generator);

      seen.length = 0;
      rfs.rotationTime = rotationTime;
      rfs.getFileName(0);

      expect(seen).toEqual([{ index: 0, time: rotationTime }]);
      rfs.destroy();
    });

    it("uses prev (interval lower boundary) when both interval and intervalBoundary are set", () => {
      const rotationTime = new Date("2015-03-29 01:29:23");
      const boundaryTime = new Date("2015-03-29 00:00:00");
      const seen: (GeneratorArguments | null)[] = [];
      const generator: StandardGenerator = args => {
        seen.push(args);

        return ! args ? "a.log" : `${args.time.toISOString()}-${args.index}.log`;
      };
      const rfs = createStream(generator, { interval: "1d", intervalBoundary: true });

      seen.length = 0;
      rfs.intervalBounds(rotationTime);
      rfs.rotationTime = rotationTime;
      rfs.getFileName(0);

      expect(seen).toEqual([{ index: 0, time: boundaryTime }]);
      rfs.destroy();
    });

    it("classical generator ignores intervalBoundary and always receives the index", () => {
      const seen: (number | null)[] = [];
      const generator: ClassicalGenerator = index => {
        seen.push(index);

        return index === null ? "live.log" : `${index}.log`;
      };
      const rfs = createStream(generator, { rotate: 3 });

      seen.length = 0;
      rfs.getFileName();
      rfs.getFileName(1);
      rfs.getFileName(2);

      expect(seen).toEqual([null, 1, 2]);
      rfs.destroy();
    });
  });
});
