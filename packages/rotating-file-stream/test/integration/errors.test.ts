import * as fsp from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { createStream, type StandardGenerator } from "../../index.ts";
import { integrationTest, useIntegrationSuite } from "./helper.ts";

const hoisted = vi.hoisted(() => ({ realOpen: undefined as typeof fsp.open | undefined }));

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fsp>();

  hoisted.realOpen = actual.open;

  return {
    ...actual,
    open: vi.fn(actual.open)
  };
});

useIntegrationSuite();

/** Wait until the stream emits `open` once. */
const onceOpen = (rfs: ReturnType<typeof createStream>): Promise<void> => new Promise(resolve => rfs.once("open", () => resolve()));

describe("errors", () => {
  it("wrong name generator (first time)", () => {
    expect(() =>
      createStream(((_args => {
        throw new Error("test");
      }) as StandardGenerator))
    ).toThrow(new Error("test"));
  });

  integrationTest({
    description: "error in timer after final",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["rotation"],
      ["_final"],
      ["_destroy", "test"],
      ["error", "test"],
      ["finish"],
      ["close"]
    ],
    run: async rfs => {
      await onceOpen(rfs);
      await vi.advanceTimersByTimeAsync(500);
      rfs.end();
      await vi.advanceTimersByTimeAsync(0);
    },
    setup: () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date(2015, 0, 23, 0, 0, 0, 500));

      let openCalls = 0;

      vi.mocked(fsp.open).mockImplementation(async (...args) => {
        openCalls += 1;
        if(openCalls > 1) throw new Error("test");

        return hoisted.realOpen!(...args);
      });
    },
    stream: [{ interval: "1s" }]
  });
});
