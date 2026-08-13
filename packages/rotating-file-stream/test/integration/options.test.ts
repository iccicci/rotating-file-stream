import { sep } from "node:path";

import { beforeEach, describe, vi } from "vitest";

import { type EventEntry, integrationTest, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

const frozen = new Date(1976, 0, 23, 15, 23, 0, 0);
const stamp = "19760123-1523";
const rotated = `${stamp}-1-test.log`;

const batchedEnd: EventEntry[] = [
  [
    "_writev",
    [
      { chunk: Buffer.from("test\n"), encoding: "buffer" },
      { chunk: Buffer.from("test\n"), encoding: "buffer" },
      { chunk: Buffer.from("test\n"), encoding: "buffer" }
    ]
  ]
];

describe("options", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(frozen);
  });

  describe("omitExtension", () => {
    integrationTest({
      description: "standard rotation keeps gzip content without a .gz file name",
      events:      [
        ["_construct"],
        ["open", "test.log"],
        ...batchedEnd,
        ["rotation"],
        ["rotated", rotated],
        ["open", "test.log"],
        ["_final"],
        ["finish"],
        ["_destroy", null],
        ["close"]
      ],
      files: {
        [rotated]:  { unzipped: "test\ntest\n" },
        "test.log": "test\n"
      },
      run: rfs => {
        rfs.write("test\n");
        rfs.write("test\n");
        rfs.end("test\n");
      },
      stream: ["test.log", { compress: "gzip", omitExtension: true, size: "10B" }]
    });

    integrationTest({
      description: "classical rotation keeps gzip content without a .gz file name",
      events:      [
        ["_construct"],
        ["open", `log${sep}test.log`],
        ...batchedEnd,
        ["rotation"],
        ["rotated", `log${sep}test.log.1`],
        ["open", `log${sep}test.log`],
        ["_final"],
        ["finish"],
        ["_destroy", null],
        ["close"]
      ],
      files: {
        [`log${sep}test.log.1`]: { unzipped: "test\ntest\n" },
        [`log${sep}test.log`]:   "test\n"
      },
      run: rfs => {
        rfs.write("test\n");
        rfs.write("test\n");
        rfs.end("test\n");
      },
      stream: ["test.log", { compress: "gzip", omitExtension: true, path: "log", rotate: 2, size: "10B" }]
    });
  });

  integrationTest({
    description: "compress false rotates without compression",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ...batchedEnd,
      ["rotation"],
      ["rotated", rotated],
      ["open", "test.log"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: {
      [rotated]:  "test\ntest\n",
      "test.log": "test\n"
    },
    run: rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: ["test.log", { compress: false, size: "10B" }]
  });
});
