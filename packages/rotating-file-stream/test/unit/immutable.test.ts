import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { resolve, sep } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { type ClassicalGenerator, RotatingFileStreamError, type StandardGenerator } from "../../index.ts";
import { createStream } from "./helper.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fsp>();

  return {
    ...actual,
    unlink: vi.fn(actual.unlink)
  };
});

const probePast = new Date(1976, 0, 23, 15);
const frozen = new Date(2015, 0, 23, 1, 0, 0, 0);
const frozenStamp = "20150123-0100";
const slot1 = `${frozenStamp}-1-test.log`;
const slot2 = `${frozenStamp}-2-test.log`;

const formatStamp = (time: Date): string =>
  `${time.getFullYear()}${String(time.getMonth() + 1).padStart(2, "0")}${String(time.getDate()).padStart(2, "0")}-${String(time.getHours()).padStart(2, "0")}${String(time.getMinutes()).padStart(2, "0")}`;

const rotatedName = (time: Date, index: number): string => `${formatStamp(time)}-${index}-test.log`;

const probeName = (time: Date, index: number): string => `probe-${formatStamp(time)}-${index}.log`;

const indexed: StandardGenerator = args => {
  if(! args) return "test.log";
  if(args.time.getTime() === probePast.getTime()) return probeName(args.time, args.index);

  return rotatedName(args.time, args.index);
};

const constant: StandardGenerator = args => {
  if(! args) return "live.log";
  if(args.time.getTime() === probePast.getTime()) return probeName(args.time, args.index);
  if(args.time.getTime() === frozen.getTime()) return "test.log";

  return `validation-${formatStamp(args.time)}-${args.index}.log`;
};

describe("immutable", () => {
  it("immutable(true) opens the first missing indexed file", async () => {
    const rfs = createStream(indexed, { immutable: true, interval: "1d", size: "10B" });
    const reopen = vi.spyOn(rfs, "reopen").mockResolvedValue();

    rfs.now = () => frozen;

    await rfs.immutable(true);

    expect(rfs.filename).toBe(`${rfs.path}${slot1}`);
    expect(rfs.last).toBe(`${rfs.path}${slot1}`);
    expect(reopen).toHaveBeenCalledWith(0);
    rfs.destroy();
  });

  it("immutable(true) appends to an existing file under the size limit", async () => {
    const dir = resolve("immutable-append");
    const file = `${dir}${sep}${slot1}`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(file, "test\n");

    const rfs = createStream(indexed, { immutable: true, interval: "1d", path: `${dir}${sep}`, size: "10B" });

    rfs.now = () => frozen;
    const reopen = vi.spyOn(rfs, "reopen").mockResolvedValue();

    await rfs.immutable(true);

    expect(rfs.filename).toBe(file);
    expect(reopen).toHaveBeenCalledWith(5);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("immutable(true) skips files already at the size limit", async () => {
    const dir = resolve("immutable-full");
    const first = `${dir}${sep}${slot1}`;
    const second = `${dir}${sep}${slot2}`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "1234567890");
    writeFileSync(second, "x");

    const rfs = createStream(indexed, { immutable: true, interval: "1d", path: `${dir}${sep}`, size: "10B" });

    rfs.now = () => frozen;
    const reopen = vi.spyOn(rfs, "reopen").mockResolvedValue();

    await rfs.immutable(true);

    expect(rfs.filename).toBe(second);
    expect(reopen).toHaveBeenCalledWith(1);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("immutable(false) emits rotated for the previous file and switches filename", async () => {
    const dir = resolve("immutable-rotate");
    const first = `${dir}${sep}${slot1}`;
    const second = `${dir}${sep}${slot2}`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "1234567890");

    const rfs = createStream(indexed, { immutable: true, interval: "1d", path: `${dir}${sep}`, size: "10B" });

    rfs.now = () => frozen;
    rfs.last = first;
    rfs.filename = first;

    const rotated = vi.spyOn(rfs, "rotated").mockResolvedValue();

    await rfs.immutable(false);

    expect(rotated).toHaveBeenCalledWith(first);
    expect(rfs.filename).toBe(second);
    expect(rfs.last).toBe(second);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("immutable throws when every candidate is full", async () => {
    const dir = resolve("immutable-exhausted");
    const file = `${dir}${sep}test.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(file, "1234567890");

    const rfs = createStream(constant, {
      immutable: true,
      interval:  "1d",
      path:      `${dir}${sep}`,
      size:      "10B"
    });

    rfs.now = () => frozen;

    await expect(rfs.immutable(true)).rejects.toEqual(new RotatingFileStreamError("Too many destination file attempts"));
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("rejects smuggled rotate options", async () => {
    const classical: ClassicalGenerator = index => (index ? `${index}.log` : "test.log");
    const rfs = createStream(indexed, { immutable: true, interval: "1d" });
    const options = rfs.options as unknown as { generator: ClassicalGenerator; rotate: number };

    options.generator = classical;
    options.rotate = 2;

    await expect(rfs.immutable(true)).rejects.toEqual(new RotatingFileStreamError("Unexpected rotate option in immutable mode"));
    rfs.destroy();
  });

  it("immutable rejects a directory target", async () => {
    const dir = resolve("immutable-dir");
    const target = `${dir}${sep}test`;

    mkdirSync(target, { recursive: true });

    const directorySlot: StandardGenerator = args => {
      if(! args) return "test.log";
      if(args.time.getTime() === probePast.getTime()) return probeName(args.time, args.index);
      if(args.index === 1) return "test";

      return rotatedName(args.time, args.index);
    };

    const rfs = createStream(directorySlot, { immutable: true, interval: "1d", path: `${dir}${sep}`, size: "10B" });

    rfs.now = () => frozen;

    await expect(rfs.immutable(true)).rejects.toEqual(new RotatingFileStreamError(`Can't write on: '${target}' (it is not a file)`));
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });
});

describe("updateSymLink", () => {
  it("creates a symlink from the not-rotated name to the active immutable file", async () => {
    const dir = resolve("immutable-link");
    const active = `${dir}${sep}${slot1}`;
    const link = `${dir}${sep}test.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(active, "test\n");

    const rfs = createStream(indexed, { immutable: true, interval: "1d", path: `${dir}${sep}`, symLink: true });

    rfs.filename = active;

    await rfs.updateSymLink();

    expect(await fsp.readlink(link)).toBe(slot1);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("replaces an existing symlink when the active file changes", async () => {
    const dir = resolve("immutable-link-update");
    const first = `${dir}${sep}${slot1}`;
    const second = `${dir}${sep}${slot2}`;
    const link = `${dir}${sep}test.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "a");
    writeFileSync(second, "b");
    symlinkSync(slot1, link);

    const rfs = createStream(indexed, { immutable: true, interval: "1d", path: `${dir}${sep}`, symLink: true });

    rfs.filename = second;

    await rfs.updateSymLink();

    expect(await fsp.readlink(link)).toBe(slot2);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("rethrows unlink failures other than ENOENT", async () => {
    const dir = resolve("immutable-link-error");
    const active = `${dir}${sep}${slot1}`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(active, "test\n");

    const rfs = createStream(indexed, { immutable: true, interval: "1d", path: `${dir}${sep}`, symLink: true });

    vi.mocked(fsp.unlink).mockRejectedValueOnce(Object.assign(new Error("blocked"), { code: "EACCES" }));

    rfs.filename = active;

    await expect(rfs.updateSymLink()).rejects.toMatchObject({ code: "EACCES" });
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });
});
