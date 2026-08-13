import { mkdirSync, writeFileSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { resolve, sep } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createStream } from "./helper.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fsp>();

  return {
    ...actual,
    open:   vi.fn(actual.open),
    stat:   vi.fn(actual.stat),
    unlink: vi.fn(actual.unlink)
  };
});

describe("history", () => {
  it("sets the default history path when maxFiles or maxSize is used", () => {
    const byCount = createStream("test.log", { maxFiles: 2 });

    expect(byCount.options.history).toBe(`${byCount.path}test.log.txt`);
    byCount.destroy();

    const bySize = createStream("test.log", { maxSize: "1K", path: "log/" });

    expect(bySize.options.history).toBe(`${bySize.path}test.log.txt`);
    bySize.destroy();
  });

  it("uses a custom history file name under the configured path", () => {
    const rfs = createStream("test.log", { history: "files.txt", maxFiles: 2, path: "log/" });

    expect(rfs.options.history).toBe(`${rfs.path}files.txt`);
    rfs.destroy();
  });

  it("keeps an absolute history path", () => {
    const absolute = resolve("custom-history.txt");
    const rfs = createStream("test.log", { history: absolute, maxFiles: 2 });

    expect(rfs.options.history).toBe(absolute);
    rfs.destroy();
  });

  it("treats an empty history file as having no prior entries", async () => {
    const dir = resolve("history-empty");
    const historyPath = `${dir}${sep}test.log.txt`;
    const rotated = `${dir}${sep}rotated.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(historyPath, "");
    writeFileSync(rotated, "x");

    const rfs = createStream("test.log", { maxFiles: 2, path: `${dir}${sep}` });

    await rfs.history(rotated);

    expect(await fsp.readFile(historyPath, "utf8")).toBe(`${rotated}\n`);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("starts from a missing history file", async () => {
    const dir = resolve("history-missing");
    const rotated = `${dir}${sep}rotated.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(rotated, "x");

    const rfs = createStream("test.log", { maxFiles: 2, path: `${dir}${sep}` });

    await rfs.history(rotated);

    expect(await fsp.readFile(`${dir}${sep}test.log.txt`, "utf8")).toBe(`${rotated}\n`);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("rejects history updates when the history path was not configured", async () => {
    const rfs = createStream("test.log", { maxFiles: 2 });

    delete rfs.options.history;

    await expect(rfs.history(`${rfs.path}rotated.log`)).rejects.toThrow("History file path is not configured");
    rfs.destroy();
  });

  it("removes the oldest files when maxFiles is exceeded", async () => {
    const dir = resolve("history-max-files");
    const historyPath = `${dir}${sep}test.log.txt`;
    const first = `${dir}${sep}first.log`;
    const second = `${dir}${sep}second.log`;
    const third = `${dir}${sep}third.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "a");
    writeFileSync(second, "bb");
    writeFileSync(third, "ccc");
    writeFileSync(historyPath, `${first}\n${second}\n`);

    const rfs = createStream("test.log", { maxFiles: 2, path: `${dir}${sep}` });
    const removed: [string, boolean][] = [];

    rfs.on("removed", (filename, byCount) => removed.push([filename, byCount]));

    await rfs.history(third);

    expect(removed).toEqual([[first, true]]);
    await expect(fsp.access(first)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fsp.readFile(historyPath, "utf8")).toBe(`${second}\n${third}\n`);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("removes the oldest files when maxSize is exceeded", async () => {
    const dir = resolve("history-max-size");
    const historyPath = `${dir}${sep}test.log.txt`;
    const first = `${dir}${sep}first.log`;
    const second = `${dir}${sep}second.log`;
    const third = `${dir}${sep}third.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "12345");
    writeFileSync(second, "12345");
    writeFileSync(third, "12345");
    writeFileSync(historyPath, `${first}\n${second}\n`);

    const rfs = createStream("test.log", { maxSize: "10B", path: `${dir}${sep}` });
    const removed: [string, boolean][] = [];

    rfs.on("removed", (filename, byCount) => removed.push([filename, byCount]));

    await rfs.history(third);

    expect(removed).toEqual([[first, false]]);
    expect(await fsp.readFile(historyPath, "utf8")).toBe(`${second}\n${third}\n`);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("warns when a history entry is not a regular file", async () => {
    const dir = resolve("history-warning");
    const historyPath = `${dir}${sep}test.log.txt`;
    const rotated = `${dir}${sep}rotated.log`;

    mkdirSync(dir, { recursive: true });
    mkdirSync("missing-entry");
    writeFileSync(rotated, "x");
    writeFileSync(historyPath, "missing-entry\n");

    const rfs = createStream("test.log", { maxFiles: 2, path: `${dir}${sep}` });
    const warnings: string[] = [];

    rfs.on("warning", error => warnings.push(error.message));

    await rfs.history(rotated);

    expect(warnings).toEqual(["File 'missing-entry' contained in history is not a regular file"]);
    expect(await fsp.readFile(historyPath, "utf8")).toBe(`${rotated}\n`);
    await fsp.rm("missing-entry", { force: true, recursive: true });
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("warns when unlinking a trimmed file fails with ENOENT", async () => {
    const dir = resolve("history-unlink-enoent");
    const historyPath = `${dir}${sep}test.log.txt`;
    const first = `${dir}${sep}first.log`;
    const second = `${dir}${sep}second.log`;
    const third = `${dir}${sep}third.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "a");
    writeFileSync(second, "bb");
    writeFileSync(third, "ccc");
    writeFileSync(historyPath, `${first}\n${second}\n`);

    const rfs = createStream("test.log", { maxFiles: 2, path: `${dir}${sep}` });
    const warnings: string[] = [];

    rfs.on("warning", error => warnings.push(error.message));

    vi.mocked(fsp.unlink).mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    await rfs.history(third);

    expect(warnings.some(message => message.includes("ENOENT"))).toBe(true);
    expect(await fsp.readFile(historyPath, "utf8")).toBe(`${second}\n${third}\n`);
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("propagates errors while unlinking a trimmed file", async () => {
    const dir = resolve("history-unlink-error");
    const historyPath = `${dir}${sep}test.log.txt`;
    const first = `${dir}${sep}first.log`;
    const second = `${dir}${sep}second.log`;
    const third = `${dir}${sep}third.log`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(first, "a");
    writeFileSync(second, "bb");
    writeFileSync(third, "ccc");
    writeFileSync(historyPath, `${first}\n${second}\n`);

    const rfs = createStream("test.log", { maxFiles: 2, path: `${dir}${sep}` });

    vi.mocked(fsp.unlink).mockRejectedValueOnce(new Error("EACCES"));

    await expect(rfs.history(third)).rejects.toThrow("EACCES");
    await fsp.rm(dir, { force: true, recursive: true });
    rfs.destroy();
  });

  it("propagates non-Error failures while reading the history file", async () => {
    const rfs = createStream("test.log", { maxSize: "10B" });

    vi.mocked(fsp.open).mockRejectedValueOnce("broken");

    await expect(rfs.history(`${rfs.path}1-test.log`)).rejects.toBe("broken");
    rfs.destroy();
  });

  it("propagates errors while reading the history file", async () => {
    const rfs = createStream("test.log", { maxSize: "10B" });
    const readError = new Error("test read");

    vi.mocked(fsp.open).mockRejectedValueOnce(readError);

    await expect(rfs.history(`${rfs.path}1-test.log`)).rejects.toThrow("test read");
    rfs.destroy();
  });

  it("propagates errors while checking a rotated file", async () => {
    const rfs = createStream("test.log", { maxSize: "10B" });
    const statError = new Error("test stat");

    vi.mocked(fsp.stat).mockRejectedValueOnce(statError);

    await expect(rfs.history(`${rfs.path}1-test.log`)).rejects.toThrow("test stat");
    rfs.destroy();
  });
});
