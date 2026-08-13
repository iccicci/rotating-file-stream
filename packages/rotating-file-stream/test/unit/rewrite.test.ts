import { type FileHandle } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { type Chunk, RotatingFileStreamError } from "../../index.ts";
import { createStream } from "./helper.ts";

describe("rewrite", () => {
  it("reports Unexpected null file handle when handle is null", async () => {
    const rfs = createStream("test.log");
    const error = await new Promise<Error | null | undefined>(resolve => {
      rfs.rewrite([{ chunk: Buffer.from(""), encoding: "buffer" }], resolve);
    });

    expect(error).toEqual(new RotatingFileStreamError("Unexpected null file handle"));
    expect(rfs.rewritePromise).toBeNull();
    rfs.destroy();
  });

  it("wraps non-Error write failures", async () => {
    const rfs = createStream("test.log");

    rfs.handle = {
      write: async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentional
        throw { code: "nope" };
      }
    } as unknown as FileHandle;

    const error = await new Promise<Error | null | undefined>(resolve => {
      rfs.rewrite([{ chunk: Buffer.from("x"), encoding: "buffer" }], resolve);
    });

    expect(error).toEqual(new RotatingFileStreamError("Unexpected error while writing: {\"code\":\"nope\"}"));
    expect(rfs.rewritePromise).toBeNull();
    rfs.destroy();
  });

  it("writes buffered chunks once when size limit is not reached", async () => {
    const rfs = createStream("test.log", { size: "20B" });
    const write = vi.fn().mockResolvedValue({ buffer: Buffer.alloc(0), bytesWritten: 0 });
    const rotate = vi.spyOn(rfs, "rotate").mockResolvedValue();

    rfs.handle = { write } as unknown as FileHandle;

    const chunks: Chunk[] = [
      { chunk: Buffer.from("12345"), encoding: "buffer" },
      { chunk: Buffer.from("67890"), encoding: "buffer" }
    ];

    await new Promise<Error | null | undefined>((resolve, reject) => {
      rfs.rewrite(chunks, error => (error ? reject(error) : resolve(error)));
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual(Buffer.from("1234567890"));
    expect(rotate).not.toHaveBeenCalled();
    expect(rfs.size).toBe(10);
    rfs.destroy();
  });

  it("writes, rotates, and continues when multiple chunks require more than one rotation", async () => {
    const rfs = createStream("test.log", { size: "5B" });
    const write = vi.fn().mockResolvedValue({ buffer: Buffer.alloc(0), bytesWritten: 0 });
    const rotate = vi.spyOn(rfs, "rotate").mockImplementation(async () => {
      rfs.size = 0;
    });

    rfs.handle = { write } as unknown as FileHandle;

    const chunks: Chunk[] = [
      { chunk: Buffer.from("1234"), encoding: "buffer" },
      { chunk: Buffer.from("5678"), encoding: "buffer" },
      { chunk: Buffer.from("90ab"), encoding: "buffer" },
      //cSpell:disable-next-line
      { chunk: Buffer.from("cdef"), encoding: "buffer" }
    ];

    await new Promise<Error | null | undefined>((resolve, reject) => {
      rfs.rewrite(chunks, error => (error ? reject(error) : resolve(error)));
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][0]).toEqual(Buffer.from("12345678"));
    expect(write.mock.calls[1][0]).toEqual(Buffer.from("90abcdef"));
    expect(rotate).toHaveBeenCalledTimes(2);
    expect(rfs.size).toBe(0);
    rfs.destroy();
  });

  it("writes the trailing buffer after the last rotation", async () => {
    const rfs = createStream("test.log", { size: "5B" });
    const write = vi.fn().mockResolvedValue({ buffer: Buffer.alloc(0), bytesWritten: 0 });
    const rotate = vi.spyOn(rfs, "rotate").mockImplementation(async () => {
      rfs.size = 0;
    });

    rfs.handle = { write } as unknown as FileHandle;

    const chunks: Chunk[] = [
      { chunk: Buffer.from("1234"), encoding: "buffer" },
      { chunk: Buffer.from("5678"), encoding: "buffer" },
      { chunk: Buffer.from("90"), encoding: "buffer" }
    ];

    await new Promise<Error | null | undefined>((resolve, reject) => {
      rfs.rewrite(chunks, error => (error ? reject(error) : resolve(error)));
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][0]).toEqual(Buffer.from("12345678"));
    expect(write.mock.calls[1][0]).toEqual(Buffer.from("90"));
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(rfs.size).toBe(2);
    rfs.destroy();
  });
});
