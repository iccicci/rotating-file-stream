import { describe, expect, it, vi } from "vitest";

import { RotatingFileStreamError } from "../../index.ts";
import { createStream } from "./helper.ts";

describe("interval", () => {
  it("schedules rotate when the interval elapses", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 500));

    const rfs = createStream("test.log", { interval: "1s" });
    const rotate = vi.spyOn(rfs, "rotate").mockResolvedValue();

    rfs.interval();
    expect(rotate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(rotate).toHaveBeenCalledTimes(1);

    rfs.destroy();
    vi.useRealTimers();
  });

  it("clear cancels the pending timer", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 500));

    const rfs = createStream("test.log", { interval: "1s" });
    const rotate = vi.spyOn(rfs, "rotate").mockResolvedValue();

    rfs.interval();
    rfs.clear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(rotate).not.toHaveBeenCalled();

    rfs.destroy();
    vi.useRealTimers();
  });

  it("does nothing when interval is not configured", () => {
    const rfs = createStream("test.log");
    const rotate = vi.spyOn(rfs, "rotate").mockResolvedValue();

    rfs.interval();
    expect(rotate).not.toHaveBeenCalled();
    expect(rfs.timeout).toBeNull();

    rfs.destroy();
  });

  it("rechecks through maxTimeout until the window ends", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(1976, 0, 1));

    const rfs = createStream("test.log", { interval: "1M" });
    const rotate = vi.spyOn(rfs, "rotate").mockResolvedValue();

    rfs.maxTimeout = 100;
    rfs.interval();

    await vi.advanceTimersByTimeAsync(100);
    expect(rotate).not.toHaveBeenCalled();
    expect(rfs.timeout).not.toBeNull();

    vi.setSystemTime(new Date(1976, 1, 1));
    await vi.advanceTimersByTimeAsync(100);
    expect(rotate).toHaveBeenCalledTimes(1);

    rfs.destroy();
    vi.useRealTimers();
  });

  it("waits for rewritePromise before rotating", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 500));

    const rfs = createStream("test.log", { interval: "1s" });
    const rotate = vi.spyOn(rfs, "rotate").mockResolvedValue();

    let releaseRewrite!: () => void;

    rfs.rewritePromise = new Promise<void>(resolve => {
      releaseRewrite = resolve;
    });

    rfs.interval();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(rotate).not.toHaveBeenCalled();

    releaseRewrite();
    await Promise.resolve();
    await Promise.resolve();

    expect(rotate).toHaveBeenCalledTimes(1);

    rfs.destroy();
    vi.useRealTimers();
  });

  it("rotates after a rejected rewritePromise", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 500));

    const rfs = createStream("test.log", { interval: "1s" });
    const rotate = vi.spyOn(rfs, "rotate").mockResolvedValue();

    let rejectRewrite!: (reason?: unknown) => void;

    rfs.rewritePromise = new Promise<void>((_resolve, reject) => {
      rejectRewrite = reject;
    });
    void rfs.rewritePromise.catch(() => undefined);

    rfs.interval();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(rotate).not.toHaveBeenCalled();

    rejectRewrite(new Error("write failed"));
    await Promise.resolve();
    await Promise.resolve();

    expect(rotate).toHaveBeenCalledTimes(1);

    rfs.destroy();
    vi.useRealTimers();
  });

  it("rejects timeoutPromise when rotate fails", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 500));

    const rfs = createStream("test.log", { interval: "1s" });

    vi.spyOn(rfs, "rotate").mockRejectedValue(new Error("boom"));
    rfs.interval();
    await vi.advanceTimersByTimeAsync(500);

    await expect(rfs.timeoutPromise).rejects.toThrow("boom");

    rfs.destroy();
    vi.useRealTimers();
  });

  it("refinal surfaces non-Error rejection reasons", async () => {
    const rfs = createStream("test.log");

    vi.spyOn(rfs, "closeHandle").mockImplementation(async () => {
      // Cover the non-Error branch in `refinal`.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentional
      throw { err: "nope" };
    });

    const error = await new Promise<Error | null | undefined>(resolve => {
      void rfs.refinal(null, resolve);
    });

    expect(error).toEqual(new RotatingFileStreamError("Unexpected error while closing handle: {\"err\":\"nope\"}"));
    rfs.destroy();
  });
});
