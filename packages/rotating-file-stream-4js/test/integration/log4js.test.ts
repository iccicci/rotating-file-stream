import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import log4js from "log4js";
import { afterEach, describe, expect, it } from "vitest";

import rotatingFileStream4js, { createStream, shareStream } from "../../index.ts";

describe("log4js integration", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await new Promise<void>(resolve => {
      log4js.shutdown(() => resolve());
    });

    while(dirs.length) {
      const dir = dirs.pop();

      if(dir) rmSync(dir, { force: true, recursive: true });
    }
  });

  const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "rfs4js-int-"));

    dirs.push(dir);

    return dir;
  };

  it("writes through rfs.filename", async () => {
    const dir = tempDir();

    log4js.configure({
      appenders: {
        out: {
          rfs:  { filename: "app.log", options: { path: dir } },
          type: rotatingFileStream4js
        }
      },
      categories: {
        default: { appenders: ["out"], level: "info" }
      }
    });

    log4js.getLogger().info("from-log4js");

    await new Promise<void>(resolve => {
      log4js.shutdown(() => resolve());
    });

    expect(readFileSync(join(dir, "app.log"), "utf8")).toMatch(/from-log4js/);
  });

  it("shares one stream across appenders with different layouts", async () => {
    const dir = tempDir();
    const stream = createStream("shared.log", { path: dir });
    const rotated: string[] = [];

    stream.on("rotated", filename => rotated.push(filename));
    stream.on("warning", () => undefined);

    await new Promise<void>(resolve => stream.once("open", () => resolve()));

    const shared = shareStream(stream);

    log4js.configure({
      appenders: {
        access: {
          layout: { pattern: "ACCESS %m", type: "pattern" },
          type:   shared
        },
        app: {
          layout: { pattern: "APP %m", type: "pattern" },
          type:   shared
        }
      },
      categories: {
        access:  { appenders: ["access"], level: "info" },
        default: { appenders: ["app"], level: "info" }
      }
    });

    log4js.getLogger().info("app-line");
    log4js.getLogger("access").info("access-line");

    await new Promise<void>(resolve => {
      log4js.shutdown(() => resolve());
    });

    const content = readFileSync(join(dir, "shared.log"), "utf8");

    expect(content).toMatch(/APP app-line/);
    expect(content).toMatch(/ACCESS access-line/);
    expect(rotated).toEqual([]);
  });
});
