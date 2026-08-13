import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createStream } from "../../index.ts";
import { integrationTest, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

const line = Buffer.from("test\n");

describe("write", () => {
  integrationTest({
    description: "single write",
    events:      [["_construct"], ["open", "test.log"], ["_write", line, "buffer"], ["_final"], ["finish"], ["_destroy", null], ["close"]],
    files:       { "test.log": "test\n" },
    run:         rfs => {
      rfs.end("test\n");
    }
  });

  integrationTest({
    description: "multi write",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { "test.log": "test\ntest\ntest\ntest\n" },
    run:   rfs => {
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    setup: () => {
      writeFileSync("test.log", "test\n");
    }
  });

  integrationTest({
    description: "destroy before open",
    events:      [["_construct"], ["open", "test.log"], ["_destroy", null], ["finish"], ["close"]],
    files:       { "test.log": "" },
    run:         rfs => {
      rfs.destroy();
      rfs.write("test\n");
    }
  });

  integrationTest({
    description: "destroy between open and write",
    events:      [["_construct"], ["open", "test.log"], ["_destroy", null], ["finish"], ["close"]],
    files:       { "test.log": "" },
    run:         rfs => {
      rfs.once("open", () => {
        rfs.destroy();
        rfs.write("test\n");
      });
    }
  });

  integrationTest({
    description: "destroy while writing",
    events:      [["_construct"], ["open", "test.log"], ["_destroy", null], ["finish"], ["close"]],
    files:       { "test.log": "" },
    run:         rfs => {
      rfs.once("open", () => {
        rfs.write("test\n");
        rfs.destroy();
      });
    }
  });

  integrationTest({
    description: "destroy after write",
    events:      [["_construct"], ["open", "test.log"], ["_write", line, "buffer"], ["_destroy", null], ["finish"], ["close"]],
    files:       { "test.log": "test\n" },
    run:         rfs => {
      rfs.once("open", () => {
        rfs.write("test\n", () => {
          rfs.destroy();
        });
      });
    }
  });

  it("two consecutive open in not existing directory", async () => {
    let count = 0;
    const rfs1 = createStream("log/test1");
    const rfs2 = createStream("log/test2");

    const opened = (): void => {
      if(++count === 2) rfs1.end(() => rfs2.end());
    };

    rfs1.on("open", opened);
    rfs2.on("open", opened);

    await Promise.all([
      new Promise<void>(resolve => rfs1.once("close", () => resolve())),
      new Promise<void>(resolve => rfs2.once("close", () => resolve()))
    ]);
    expect(count).toBe(2);
  });

  integrationTest({
    description: "multiple writes in synchronous sequence",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { "test.log": "test\ntest\ntest\ntest\n" },
    run:   rfs => {
      // The stream waits for _construct to complete before writing
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.write("test\n");
      rfs.end("test\n");
    },
    stream: [{ size: "30B" }]
  });

  integrationTest({
    description: "multiple writes in asynchronous sequence",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", line, "buffer"],
      ["_write", line, "buffer"],
      [
        "_writev",
        [
          { chunk: line, encoding: "buffer" },
          { chunk: line, encoding: "buffer" }
        ]
      ],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    files: { "test.log": "test\ntest\ntest\ntest\n" },
    run:   rfs => {
      // the stream waits for _construct to complete before writing
      rfs.write("test\n", error => {
        if(error) throw error;

        // The stream writes the first immediately with _write next the other two with _writev
        rfs.write("test\n");
        rfs.write("test\n");
        rfs.end("test\n");
      });
    },
    stream: [{ size: "30B" }]
  });

  integrationTest({
    description: "write with not utf8 encoding",
    events:      [
      ["_construct"],
      ["open", "test.log"],
      ["_write", Buffer.from("café\n", "latin1"), "buffer"],
      ["_final"],
      ["finish"],
      ["_destroy", null],
      ["close"]
    ],
    // é is 0xe9 in latin1, but 0xc3 0xa9 in utf8; proves the write encoding was applied.
    files: { "test.log": Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) },
    run:   rfs => {
      rfs.end("café\n", "latin1");
    }
  });

  integrationTest({
    description: "write after open",
    events:      [["_construct"], ["open", "test.log"], ["_write", line, "buffer"], ["_final"], ["finish"], ["_destroy", null], ["close"]],
    files:       { "test.log": "test\n" },
    run:         rfs => {
      rfs.once("open", () => {
        rfs.end("test\n");
      });
    },
    stream: [{ size: "10B" }]
  });

  integrationTest({
    description: "end callback",
    events:      [["_construct"], ["open", "test.log"], ["_write", line, "buffer"], ["_final"], ["finish"], ["_destroy", null], ["close"]],
    files:       { ended: "", "test.log": "test\n" },
    run:         rfs => {
      rfs.end("test\n", () => {
        writeFileSync("ended", "");
      });
    },
    stream: [{ size: "10B" }]
  });
});
