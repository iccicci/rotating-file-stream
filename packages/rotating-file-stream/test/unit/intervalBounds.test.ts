import { describe, expect, it } from "vitest";

import { RotatingFileStreamError } from "../../index.ts";
import { createStream } from "./helper.ts";

const frozenNow = new Date(1976, 0, 23, 15, 23, 23, 23);

describe("intervalBounds", () => {
  it.each([
    { interval: "1h", intervalUTC: false, next: new Date(1976, 0, 23, 16), prev: new Date(1976, 0, 23, 15) },
    { interval: "2h", intervalUTC: false, next: new Date(1976, 0, 23, 16), prev: new Date(1976, 0, 23, 14) },
    { interval: "3h", intervalUTC: false, next: new Date(1976, 0, 23, 18), prev: new Date(1976, 0, 23, 15) },
    { interval: "4h", intervalUTC: false, next: new Date(1976, 0, 23, 16), prev: new Date(1976, 0, 23, 12) },
    { interval: "6h", intervalUTC: false, next: new Date(1976, 0, 23, 18), prev: new Date(1976, 0, 23, 12) },
    { interval: "8h", intervalUTC: false, next: new Date(1976, 0, 23, 16), prev: new Date(1976, 0, 23, 8) },
    { interval: "12h", intervalUTC: false, next: new Date(1976, 0, 24), prev: new Date(1976, 0, 23, 12) },
    { interval: "24h", intervalUTC: false, next: new Date(1976, 0, 24), prev: new Date(1976, 0, 23) },
    { interval: "1h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 23, 15)), prev: new Date(Date.UTC(1976, 0, 23, 14)) },
    { interval: "2h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 23, 16)), prev: new Date(Date.UTC(1976, 0, 23, 14)) },
    { interval: "3h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 23, 15)), prev: new Date(Date.UTC(1976, 0, 23, 12)) },
    { interval: "4h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 23, 16)), prev: new Date(Date.UTC(1976, 0, 23, 12)) },
    { interval: "6h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 23, 18)), prev: new Date(Date.UTC(1976, 0, 23, 12)) },
    { interval: "8h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 23, 16)), prev: new Date(Date.UTC(1976, 0, 23, 8)) },
    { interval: "12h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 24)), prev: new Date(Date.UTC(1976, 0, 23, 12)) },
    { interval: "24h", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 24)), prev: new Date(Date.UTC(1976, 0, 23)) },
    { interval: "1d", intervalUTC: false, next: new Date(1976, 0, 24), prev: new Date(1976, 0, 23) },
    { interval: "2d", intervalUTC: false, next: new Date(1976, 0, 25), prev: new Date(1976, 0, 23) },
    { interval: "7d", intervalUTC: false, next: new Date(1976, 0, 30), prev: new Date(1976, 0, 23) },
    { interval: "1d", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 24)), prev: new Date(Date.UTC(1976, 0, 23)) },
    { interval: "2d", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 25)), prev: new Date(Date.UTC(1976, 0, 23)) },
    { interval: "7d", intervalUTC: true, next: new Date(Date.UTC(1976, 0, 30)), prev: new Date(Date.UTC(1976, 0, 23)) },
    { interval: "1M", intervalUTC: false, next: new Date(1976, 1, 1), prev: new Date(1976, 0, 1) },
    { interval: "2M", intervalUTC: false, next: new Date(1976, 2, 1), prev: new Date(1976, 0, 1) },
    { interval: "3M", intervalUTC: false, next: new Date(1976, 3, 1), prev: new Date(1976, 0, 1) },
    { interval: "6M", intervalUTC: false, next: new Date(1976, 6, 1), prev: new Date(1976, 0, 1) },
    { interval: "1M", intervalUTC: true, next: new Date(Date.UTC(1976, 1, 1)), prev: new Date(Date.UTC(1976, 0, 1)) },
    { interval: "2M", intervalUTC: true, next: new Date(Date.UTC(1976, 2, 1)), prev: new Date(Date.UTC(1976, 0, 1)) },
    { interval: "3M", intervalUTC: true, next: new Date(Date.UTC(1976, 3, 1)), prev: new Date(Date.UTC(1976, 0, 1)) },
    { interval: "6M", intervalUTC: true, next: new Date(Date.UTC(1976, 6, 1)), prev: new Date(Date.UTC(1976, 0, 1)) },
    { interval: "1m", intervalUTC: false, next: new Date(1976, 0, 23, 15, 24), prev: new Date(1976, 0, 23, 15, 23) },
    { interval: "2m", intervalUTC: false, next: new Date(1976, 0, 23, 15, 24), prev: new Date(1976, 0, 23, 15, 22) },
    { interval: "5m", intervalUTC: false, next: new Date(1976, 0, 23, 15, 25), prev: new Date(1976, 0, 23, 15, 20) },
    { interval: "6m", intervalUTC: false, next: new Date(1976, 0, 23, 15, 24), prev: new Date(1976, 0, 23, 15, 18) },
    { interval: "10m", intervalUTC: false, next: new Date(1976, 0, 23, 15, 30), prev: new Date(1976, 0, 23, 15, 20) },
    { interval: "15m", intervalUTC: false, next: new Date(1976, 0, 23, 15, 30), prev: new Date(1976, 0, 23, 15, 15) },
    { interval: "30m", intervalUTC: false, next: new Date(1976, 0, 23, 15, 30), prev: new Date(1976, 0, 23, 15) },
    { interval: "60m", intervalUTC: false, next: new Date(1976, 0, 23, 16), prev: new Date(1976, 0, 23, 15) },
    { interval: "1m", intervalUTC: true, next: new Date(1976, 0, 23, 15, 24), prev: new Date(1976, 0, 23, 15, 23) },
    { interval: "15m", intervalUTC: true, next: new Date(1976, 0, 23, 15, 30), prev: new Date(1976, 0, 23, 15, 15) },
    { interval: "60m", intervalUTC: true, next: new Date(1976, 0, 23, 16), prev: new Date(1976, 0, 23, 15) },
    { interval: "1s", intervalUTC: false, next: new Date(1976, 0, 23, 15, 23, 24), prev: new Date(1976, 0, 23, 15, 23, 23) },
    { interval: "2s", intervalUTC: false, next: new Date(1976, 0, 23, 15, 23, 24), prev: new Date(1976, 0, 23, 15, 23, 22) },
    { interval: "5s", intervalUTC: false, next: new Date(1976, 0, 23, 15, 23, 25), prev: new Date(1976, 0, 23, 15, 23, 20) },
    { interval: "15s", intervalUTC: false, next: new Date(1976, 0, 23, 15, 23, 30), prev: new Date(1976, 0, 23, 15, 23, 15) },
    { interval: "30s", intervalUTC: false, next: new Date(1976, 0, 23, 15, 23, 30), prev: new Date(1976, 0, 23, 15, 23) },
    { interval: "60s", intervalUTC: false, next: new Date(1976, 0, 23, 15, 24), prev: new Date(1976, 0, 23, 15, 23) },
    { interval: "1s", intervalUTC: true, next: new Date(1976, 0, 23, 15, 23, 24), prev: new Date(1976, 0, 23, 15, 23, 23) },
    { interval: "30s", intervalUTC: true, next: new Date(1976, 0, 23, 15, 23, 30), prev: new Date(1976, 0, 23, 15, 23) }
  ])("$interval intervalUTC=$intervalUTC", ({ interval, intervalUTC, next, prev }) => {
    const rfs = createStream(
      "test.log",
      intervalUTC ? { interval, intervalBoundary: true, intervalUTC } : { interval, intervalUTC: false }
    );
    const start = rfs.intervalBounds(frozenNow);

    expect(start).toEqual(prev);
    expect(rfs.prev).toBe(prev.getTime());
    expect(rfs.next).toBe(next.getTime());
    rfs.destroy();
  });

  it("throws Unexpected null interval when interval is not set", () => {
    const rfs = createStream("test.log");

    expect(() => rfs.intervalBounds(frozenNow)).toThrow(new RotatingFileStreamError("Unexpected null interval"));
    rfs.destroy();
  });

  it("3h window shortens across Europe/Rome DST spring forward", () => {
    const rfs = createStream("test.log", { interval: "3h" });

    rfs.intervalBounds(new Date(2015, 2, 29, 1, 29, 23, 123));
    expect(rfs.next - rfs.prev).toBe(7200000);
    rfs.destroy();
  });

  it("3d window shortens across Europe/Rome DST spring forward", () => {
    const rfs = createStream("test.log", { interval: "3d" });

    rfs.intervalBounds(new Date(2015, 2, 29, 1, 29, 23, 123));
    expect(rfs.next - rfs.prev).toBe(255600000);
    rfs.destroy();
  });

  it.each([
    { interval: "1d" as const, next: "2026-08-11T00:00:00.000Z", prev: "2026-08-10T00:00:00.000Z" },
    { interval: "3h" as const, next: "2026-08-10T06:00:00.000Z", prev: "2026-08-10T03:00:00.000Z" },
    { interval: "1M" as const, next: "2026-09-01T00:00:00.000Z", prev: "2026-08-01T00:00:00.000Z" }
  ])("intervalUTC $interval boundary", ({ interval, next, prev }) => {
    const rfs = createStream("test.log", { interval, intervalBoundary: true, intervalUTC: true });

    rfs.intervalBounds(new Date("2026-08-10T04:00:00.000Z"));
    expect(new Date(rfs.prev).toISOString()).toBe(prev);
    expect(new Date(rfs.next).toISOString()).toBe(next);
    rfs.destroy();
  });
});
