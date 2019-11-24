"use strict";

import { deepStrictEqual as deq } from "assert";
import { test } from "./helper";

describe("clean", () => {
	const events = test({ filename: "test" }, rfs => rfs.end("test"));

	it("clean", () => deq(events, { close: 1, error: ["Can't write on: test (it is not a file)"], finish: 1, write: 1 }));
});
