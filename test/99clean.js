/* jshint mocha: true */
"use strict";

var cp = require("child_process");

describe("clean", function() {
	it("clean", function() {
	cp.exec("rm -rf *log *gz *tmp", function() {});
	});
});
