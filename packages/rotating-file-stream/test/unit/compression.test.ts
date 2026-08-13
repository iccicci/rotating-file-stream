import type * as NodeFs from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createStream } from "./helper.ts";

/** When set, `createWriteStream` mocks `close` on that path to fail with `"test"`. */
const gzipCloseFailPath = vi.hoisted(() => ({ current: undefined as string | undefined }));

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof NodeFs>();

  return {
    ...actual,
    createWriteStream: (path: string, options?: Parameters<typeof actual.createWriteStream>[1]) => {
      const stream = actual.createWriteStream(path, options);

      if(path === gzipCloseFailPath.current) {
        stream.close = (callback?: (error?: Error | null) => void) => {
          callback?.(new Error("test"));

          return stream;
        };
      }

      return stream;
    }
  };
});

describe("compression", () => {
  afterEach(() => {
    gzipCloseFailPath.current = undefined;
  });

  it("move gzip-compresses the live file into the rotated destination", async () => {
    const dir = resolve("compress-move-gzip");
    const live = `${dir}${sep}test.log`;
    const dest = `${dir}${sep}rotated.log.gz`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(live, "payload\n");

    const rfs = createStream("rotated.log", { compress: "gzip", path: `${dir}${sep}`, size: "10B" });

    rfs.filename = live;
    vi.spyOn(rfs, "findName").mockResolvedValue(dest);
    vi.spyOn(rfs, "touch").mockResolvedValue();
    const rotated = vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.move();

    expect(rotated).toHaveBeenCalledWith(dest);
    expect(gunzipSync(await fsp.readFile(dest)).toString("utf8")).toBe("payload\n");
    await expect(fsp.access(live)).rejects.toMatchObject({ code: "ENOENT" });
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("move runs an external compression command", async () => {
    const dir = resolve("compress-move-external");
    const live = `${dir}${sep}test.log`;
    const dest = `${dir}${sep}rotated.log.gz`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(live, "payload\n");

    const compress = vi.fn((source: string, target: string) => `cp ${source} ${target}`);
    const rfs = createStream("rotated.log", { compress, path: `${dir}${sep}`, size: "10B" });

    rfs.filename = live;

    const external = vi.fn();

    rfs.on("external", external);
    vi.spyOn(rfs, "findName").mockResolvedValue(dest);
    vi.spyOn(rfs, "touch").mockResolvedValue();
    vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.move();

    expect(compress).toHaveBeenCalledWith(live, dest);
    expect(external).toHaveBeenCalled();
    expect(await fsp.readFile(dest, "utf8")).toBe("payload\n");
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("emits warning when the gzip output stream close fails", async () => {
    const dir = resolve("compress-gzip-close");
    const live = `${dir}${sep}test.log`;
    const dest = `${dir}${sep}rotated.log.gz`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(live, "test\ntest\n");

    gzipCloseFailPath.current = dest;

    const rfs = createStream("rotated.log", { compress: "gzip", path: `${dir}${sep}`, size: "10B" });
    const warnings: string[] = [];

    rfs.on("warning", error => warnings.push(error.message));
    rfs.filename = live;

    vi.spyOn(rfs, "findName").mockResolvedValue(dest);
    vi.spyOn(rfs, "touch").mockResolvedValue();
    vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.move();

    expect(warnings).toEqual(["test"]);
    expect(gunzipSync(await fsp.readFile(dest)).toString("utf8")).toBe("test\ntest\n");
    await expect(fsp.access(live)).rejects.toMatchObject({ code: "ENOENT" });
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });
});
