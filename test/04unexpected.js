/* jshint mocha: true */
"use strict";

var assert = require("assert");
var fs = require("fs");
var rfs = require("./helper");

describe("unexpected", function() {
	describe("no rotated file available", function() {
		before(function(done) {
			this.rfs = rfs(done, { size: "5B" }, function(time, index) { return "test.log"; });
			this.rfs.end("test\n");
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Too many destination file attempts");
			assert.equal(this.rfs.err.attempts["test.log"], 1000);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("1 single write", function() {
			assert.equal(this.rfs.ev.single, 1);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});
	});

	describe("no rotated file available (initial rotation)", function() {
		before(function(done) {
			this.rfs = rfs(done, { size: "5B" }, function(time, index) { return "test.log"; });
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Too many destination file attempts");
			assert.equal(this.rfs.err.attempts["test.log"], 1000);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("0 single write", function() {
			assert.equal(this.rfs.ev.single, 0);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});
	});
});
