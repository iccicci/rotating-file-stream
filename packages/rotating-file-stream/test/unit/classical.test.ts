import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { type ClassicalGenerator, RotatingFileStreamError } from "../../index.ts";
import { createStream } from "./helper.ts";

describe("classical", () => {
  it("moves the live file into slot 1 when no backups exist", async () => {
    const dir = resolve("classical-first");
    const live = `${dir}${sep}test.log`;
    const first = `${dir}${sep}test.log.1`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(live, "test\ntest\n");

    const rfs = createStream("test.log", { path: `${dir}${sep}`, rotate: 2, size: "10B" });

    rfs.filename = live;
    const rotated = vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.classical();

    expect(rotated).toHaveBeenCalledWith(first);
    expect(await import("node:fs/promises").then(fsp => fsp.readFile(first, "utf8"))).toBe("test\ntest\n");
    await import("node:fs/promises").then(fsp => fsp.rm(dir, { force: true, recursive: true }));
    rfs.destroy();
  });

  it("shifts an existing backup before moving the live file", async () => {
    const dir = resolve("classical-shift");
    const live = `${dir}${sep}test.log`;
    const first = `${dir}${sep}test.log.1`;
    const second = `${dir}${sep}test.log.2`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "old\n");
    writeFileSync(live, "live\n");

    const rfs = createStream("test.log", { path: `${dir}${sep}`, rotate: 2, size: "10B" });

    rfs.filename = live;
    const rotated = vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.classical();

    expect(rotated).toHaveBeenCalledWith(second);
    const fsp = await import("node:fs/promises");

    expect(await fsp.readFile(second, "utf8")).toBe("old\n");
    expect(await fsp.readFile(first, "utf8")).toBe("live\n");
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("gzip-compresses the live file into slot 1 when compress is enabled", async () => {
    const dir = resolve("classical-gzip");
    const live = `${dir}${sep}test.log`;
    const first = `${dir}${sep}test.log.1.gz`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(live, "test\ntest\n");

    const rfs = createStream("test.log", { compress: "gzip", path: `${dir}${sep}`, rotate: 2, size: "10B" });

    rfs.filename = live;
    const rotated = vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.classical();

    expect(rotated).toHaveBeenCalledWith(first);
    const raw = await import("node:fs/promises").then(fsp => fsp.readFile(first));

    expect(gunzipSync(raw).toString("utf8")).toBe("test\ntest\n");
    await import("node:fs/promises").then(fsp => fsp.rm(dir, { force: true, recursive: true }));
    rfs.destroy();
  });

  it("creates missing parent directories before renaming", async () => {
    const dir = resolve("classical-mkdir");
    const live = `${dir}${sep}test.log`;
    const rotatedPath = `${dir}${sep}log${sep}1.test.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(live, "test\ntest\n");

    const logIndexed: ClassicalGenerator = index => (index ? `log${sep}${index}.test.log` : "test.log");
    const rfs = createStream(logIndexed, { path: `${dir}${sep}`, rotate: 2, size: "10B" });

    rfs.filename = live;
    const rotated = vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.classical();

    expect(rotated).toHaveBeenCalledWith(rotatedPath);
    const fsp = await import("node:fs/promises");

    expect(await fsp.readFile(rotatedPath, "utf8")).toBe("test\ntest\n");
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("runs an external compression command for slot 1", async () => {
    const dir = resolve("classical-external");
    const live = `${dir}${sep}test.log`;
    const dest = `${dir}${sep}test.log.1.gz`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(live, "payload\n");

    const compress = vi.fn((source: string, target: string) => `cp ${source} ${target}`);
    const rfs = createStream("test.log", { compress, path: `${dir}${sep}`, rotate: 1, size: "10B" });

    rfs.filename = live;

    const external = vi.fn();

    rfs.on("external", external);
    const rotated = vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.classical();

    expect(compress).toHaveBeenCalledWith(live, dest);
    expect(external).toHaveBeenCalled();
    expect(rotated).toHaveBeenCalledWith(dest);
    const fsp = await import("node:fs/promises");

    expect(await fsp.readFile(dest, "utf8")).toBe("payload\n");
    await expect(fsp.access(live)).rejects.toMatchObject({ code: "ENOENT" });
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("rejects classical rotation when options.rotate was removed", async () => {
    const rfs = createStream("test.log", { rotate: 2, size: "10B" });
    const options = rfs.options as unknown as { rotate?: number };

    delete options.rotate;

    await expect(rfs.classical()).rejects.toEqual(new RotatingFileStreamError("Unexpected classical rotation without options.rotate"));
    rfs.destroy();
  });

  it("rotate delegates to classical when options.rotate is set", async () => {
    const rfs = createStream("test.log", { rotate: 2, size: "10B" });
    const classical = vi.spyOn(rfs, "classical").mockResolvedValue();
    const move = vi.spyOn(rfs, "move");

    vi.spyOn(rfs, "closeHandle").mockResolvedValue();

    await rfs.rotate();

    expect(classical).toHaveBeenCalledTimes(1);
    expect(move).not.toHaveBeenCalled();
    rfs.destroy();
  });
});
