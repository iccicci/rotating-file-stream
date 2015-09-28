/* jshint mocha: true */
"use strict";

var assert = require("assert");
var exec = require("./helper").exec;
var fs = require("fs");
var rfs = require("./helper").rfs;

describe("unexpected", function() {
	describe("no rotated file available", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "5B" }, function(time, index) { return "test.log"; });
				self.rfs.end("test\n");
			});
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
			var self = this;
			exec(done, "rm -rf *log ; echo test > test.log", function() {
				self.rfs = rfs(done, { size: "5B" }, function(time, index) { return "test.log"; });
			});
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

	describe("error while write", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { interval: "10d" });
				self.rfs.stream.write = function(buffer, callback) { process.nextTick(callback.bind(null, new Error("Test error"))); };
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Test error");
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
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
			assert.equal(fs.readFileSync("test.log"), "");
		});
	});

	describe("error while rename", function() {
		before(function(done) {
			var self  = this;
			var oldR  = fs.rename;
			fs.rename = function(a, b, callback) { process.nextTick(callback.bind(null, new Error("Test error"))); };
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(function() { fs.rename = oldR; done(); }, { size: "5B" });
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Test error");
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

	describe("error on first open", function() {
		before(function(done) {
			var self = this;
			var oldC = fs.createWriteStream;
			fs.createWriteStream = function() { throw new Error("Test error"); };
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(function() { fs.createWriteStream = oldC; done(); }, { size: "5B" });
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Test error");
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
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
	});
});
