import { Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { createStream } from "./helper.ts";

describe("destroy", () => {
  it("forwards write overloads while the stream is active", () => {
    const superWrite = vi.spyOn(Writable.prototype, "write").mockReturnValue(true);
    const rfs = createStream("test.log");

    rfs.write("plain", () => undefined);
    rfs.write("encoded", "utf8", () => undefined);
    rfs.write("a", "utf8");

    expect(superWrite).toHaveBeenCalledTimes(3);
    superWrite.mockRestore();
    rfs.destroy();
  });

  it("emits finish on close when destroy was called without end", async () => {
    const rfs = createStream("test.log");
    const events: string[] = [];

    rfs.on("finish", () => events.push("finish"));
    rfs.on("close", () => events.push("close"));

    rfs.destroy();
    await new Promise<void>(resolve => rfs.once("close", () => resolve()));

    expect(events).toEqual(["finish", "close"]);
  });

  it("rejects write calls made after destroy was requested", async () => {
    const rfs = createStream("test.log");
    const error = await new Promise<Error | null | undefined>(resolve => {
      rfs.destroy();
      rfs.destroy();
      rfs.write("test\n", resolve);
    });

    expect(error).toMatchObject({
      code:    "ERR_STREAM_DESTROYED",
      message: "Cannot call write after a stream was destroyed"
    });
    await new Promise<void>(resolve => rfs.once("close", () => resolve()));
  });

  it("refinal waits for rewritePromise before closing the handle", async () => {
    const rfs = createStream("test.log");
    let releaseWrite!: () => void;

    rfs.rewritePromise = new Promise<void>(resolve => {
      releaseWrite = resolve;
    });
    const closeHandle = vi.spyOn(rfs, "closeHandle").mockResolvedValue();
    const done = vi.fn();

    void rfs.refinal(null, done);
    await Promise.resolve();
    expect(closeHandle).not.toHaveBeenCalled();

    releaseWrite();
    await Promise.resolve();
    await Promise.resolve();

    expect(closeHandle).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(null);
    rfs.destroy();
  });
});
