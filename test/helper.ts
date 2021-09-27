"use strict";

import { Generator, Options, RotatingFileStream, createStream } from "..";
import { Stats, chmod, close, futimes, mkdir, open, readdir, rmdir, stat, unlink, write } from "fs";
import { sep } from "path";

const proto: any = RotatingFileStream.prototype;
const pseudo = { fsMkdir: mkdir, makePath: proto.makePath };

function fillFiles(files: any, done: () => void): void {
  if(! files) return done();

  let empty = 0;
  let filled = 0;

  const end = (): void => (++filled === empty ? done() : null);

  Object.keys(files).map((file: string) => {
    const value = files[file];
    const content = typeof value === "string" ? value : value.content;

    const fill = (fd: number): void =>
      write(fd, content, (error: Error): any => {
        if(error) return process.stderr.write(`Error writing on '${file}': ${error.message}\n`, end);
        const done = (): void =>
          close(fd, (error: Error): any => {
            if(error) return process.stderr.write(`Error closing for '${file}': ${error.message}\n`, end);
            if(typeof value !== "object" || ! value.mode) return end();
            chmod(file, value.mode, end);
          });
        if(typeof value !== "object" || ! value.date) return done();
        futimes(fd, files[file].date, files[file].date, (error: Error): any => {
          if(error) return process.stderr.write(`Error changing date for '${file}': ${error.message}\n`, end);
          done();
        });
      });

    const reopen = (file: string, retry?: boolean): void =>
      open(file, "w", (error: NodeJS.ErrnoException, fd: number): any => {
        if(error) {
          if(error.code === "ENOENT" && ! retry) return pseudo.makePath(file, () => reopen(file, true));
          return process.stderr.write(`Error opening '${file}': ${error.message}\n`, end);
        }
        fill(fd);
      });

    ++empty;
    reopen(file);
  });

  if(empty === 0) done();
}

function recursiveRemove(path: string, done: () => any): any {
  const notRoot: boolean = path !== ".";

  stat(path, (error: Error, stats: Stats): any => {
    const rm = (): void => (notRoot ? (stats.isFile() ? unlink : rmdir)(path, error => (error ? process.stderr.write(`Error deleting '${path}': ${error.message}\n`, done) : done())) : done());

    if(error) return process.stderr.write(`Error getting stats for '${path}': ${error.message}\n`, done);
    if(stats.isFile()) return rm();
    if(! stats.isDirectory()) return process.stderr.write(`'${path}': Unknown file type`, done);

    readdir(path, (error, files) => {
      if(error) return process.stderr.write(`Error reading dir '${path}': ${error.message}\n`, done);

      let count = 0;
      let total = 0;

      const callback: () => void = () => (++count === total ? rm() : null);

      files.map(file => {
        if(notRoot || file.match(/(gz|log|tmp|txt)$/)) {
          total++;
          recursiveRemove(path + sep + file, callback);
        }
      });

      if(total === 0) rm();
    });
  });
}

interface testOpt {
  filename?: string | Generator;
  files?: any;
  options?: Options;
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
      rfs.on("error", error => push("error", "code" in error ? error["code"] : error.message));
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

    recursiveRemove(".", () => fillFiles(files, create));
  });

  return events;
}

export const gte14 = parseInt(process.versions.node.split(".")[0], 10) >= 14;

export function v14(): { close?: number } {
  return gte14 ? { close: 1 } : {};
}
