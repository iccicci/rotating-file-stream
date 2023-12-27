"use strict";

import { Generator, Options, createStream } from "..";
import { chmod, mkdir, readdir, rm, rmdir, stat, unlink, utimes, writeFile } from "fs/promises";

type FilesOpt = { [key: string]: string | { content: string; date?: Date; mode?: number } };

async function fillFiles(files?: FilesOpt): Promise<void> {
  if(! files) return;

  for(const file in files) {
    const value = files[file];
    const content = typeof value === "string" ? value : value.content;
    const tokens = file.split("/");

    if(tokens.length > 1) await mkdir(tokens.slice(0, -1).join("/"), { recursive: true });
    await writeFile(file, content);

    if(typeof value !== "string") {
      const { date, mode } = value;

      if(date) await utimes(file, date, date);
      if(mode) await chmod(file, mode);
    }
  }
}

async function recursiveRemove(): Promise<void> {
  const files = await readdir(".");
  const versions = process.version
    .replace("v", "")
    .split(".")
    .map(_ => parseInt(_, 10));
  const ge14_14 = versions[0] > 14 || (versions[0] === 14 && versions[1] >= 14);

  for(const file of files) {
    if(file.match(/(gz|log|tmp|txt)$/)) {
      if(ge14_14) await rm(file, { recursive: true });
      else {
        const stats = await stat(file);

        if(stats.isDirectory()) await rmdir(file, { recursive: true });
        else await unlink(file);
      }
    }
  }
}

interface testOpt {
  filename?: string | Generator;
  files?: FilesOpt;
  options?: Options;
}

interface ErrorWithCode {
  code: string;
}

function isErrorWithCode(error: any): error is ErrorWithCode {
  return "code" in error;
}

export function test(opt: testOpt, test: (rfs: any) => void): any {
  const { filename, files, options } = opt;
  const events: any = {};

  before(function(done): void {
    let did: boolean;

    const generator = filename ? filename : (time: number | Date, index?: number): string => (time ? index + "-test.log" : "test.log");
    const timeOut = setTimeout(() => {
      events.timedOut = true;
      done();
    }, this.timeout() - 500);

    const end = (): void => {
      clearTimeout(timeOut);
      if(did) return;
      did = true;
      done();
    };

    const create = (): void => {
      const rfs = createStream(generator, options);
      const inc: (name: string) => any = name => {
        if(! events[name]) events[name] = 0;
        events[name]++;
      };
      const push: (name: string, what: string) => any = (name, what) => {
        if(! events[name]) events[name] = [];
        events[name].push(what);
      };

      rfs.on("close", () => inc("close"));
      rfs.on("error", error => push("error", isErrorWithCode(error) ? error.code : error.message));
      rfs.on("external", (stdout, stderr) => {
        push("stdout", stdout);
        push("stderr", stderr);
      });
      rfs.on("finish", end);
      rfs.on("finish", () => inc("finish"));
      rfs.on("history", () => inc("history"));
      rfs.on("open", filename => push("open", filename));
      rfs.on("removed", (filename, number) => push("removed" + (number ? "n" : "s"), filename));
      rfs.on("rotated", filename => push("rotated", filename));
      rfs.on("rotation", () => inc("rotation"));
      rfs.on("warning", error => push("warning", error.message));

      const oldw = rfs._write;
      const oldv = rfs._writev;

      rfs._write = (chunk: Buffer, encoding: string, callback: (error?: Error) => void): void => {
        inc("write");
        oldw.call(rfs, chunk, encoding, callback);
      };

      rfs._writev = (chunks: any, callback: (error?: Error) => void): void => {
        inc("writev");
        oldv.call(rfs, chunks, callback);
      };

      test(rfs);
    };

    (async () => {
      await recursiveRemove();
      await fillFiles(files);
      create();
    })();
  });

  return events;
}
