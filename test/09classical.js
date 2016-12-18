/* jshint mocha: true */
"use strict";

var assert = require("assert");
var cp     = require("child_process");
var exec   = require("./helper").exec;
var fs     = require("fs");
var rfs    = require("./helper").rfs;

describe("classical", function() {
	describe("initial rotation with interval", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log test.log.* ; echo test > test.log ; echo test >> test.log", function() {
				self.rfs = rfs(done, { size: "10B", interval: "1d", rotate: 2 }, "test.log");
				self.rfs.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("1 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 1);
			assert.equal(this.rfs.ev.rotated[0], "test.log.1");
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

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("test.log.1"), "test\ntest\n");
		});
	});

	describe("rotation overflow", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log test.log.* ; echo test > test.log ; echo test >> test.log", function() {
				self.rfs = rfs(done, { size: "10B", rotate: 2 }, "test.log");
				self.rfs.write("test\ntest\n");
				self.rfs.write("test\ntest\ntest\n");
				self.rfs.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("3 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 3);
		});

		it("3 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 3);
			assert.equal(this.rfs.ev.rotated[0], "test.log.1");
			assert.equal(this.rfs.ev.rotated[1], "test.log.2");
			assert.equal(this.rfs.ev.rotated[2], "test.log.2");
		});

		it("1 single write", function() {
			assert.equal(this.rfs.ev.single, 1);
		});

		it("1 multi write", function() {
			assert.equal(this.rfs.ev.multi, 1);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("rotated file content 1", function() {
			assert.equal(fs.readFileSync("test.log.1"), "test\ntest\ntest\n");
		});

		it("rotated file content 2", function() {
			assert.equal(fs.readFileSync("test.log.2"), "test\ntest\n");
		});
	});

	describe("missing directory", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log test.log.* ; echo test > test.log ; echo test >> test.log", function() {
				self.rfs = rfs(done, { size: "10B", rotate: 2 }, function(index) { if(! index) return "test.log"; return "test.log." + index + "/log"; });
				self.rfs.write("test\ntest\n");
				self.rfs.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("2 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 2);
		});

		it("2 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 2);
			assert.equal(this.rfs.ev.rotated[0], "test.log.1/log");
			assert.equal(this.rfs.ev.rotated[1], "test.log.2/log");
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("rotated file content 1", function() {
			assert.equal(fs.readFileSync("test.log.1/log"), "test\ntest\n");
		});

		it("rotated file content 2", function() {
			assert.equal(fs.readFileSync("test.log.2/log"), "test\ntest\n");
		});
	});

	describe("compression", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log test.log.* ; echo test > test.log ; echo test >> test.log", function() {
				self.rfs = rfs(done, { size: "10B", rotate: 2, compress: true }, "test.log");
				self.rfs.write("test\ntest\n");
				self.rfs.write("test\ntest\ntest\n");
				self.rfs.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("3 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 3);
		});

		it("3 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 3);
			assert.equal(this.rfs.ev.rotated[0], "test.log.1");
			assert.equal(this.rfs.ev.rotated[1], "test.log.2");
			assert.equal(this.rfs.ev.rotated[2], "test.log.2");
		});

		it("1 single write", function() {
			assert.equal(this.rfs.ev.single, 1);
		});

		it("1 multi write", function() {
			assert.equal(this.rfs.ev.multi, 1);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("rotated file content 1", function(done) {
			cp.exec("zcat test.log.1", function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\ntest\n");
				done();
			});
		});

		it("rotated file content 2", function(done) {
			cp.exec("zcat test.log.2", function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\n");
				done();
			});
		});
	});

	describe("rotating on directory which is file", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log *.log.? ; > test2.log", function() {
				self.rfs = rfs(done, { rotate: 2, size: "5B" }, function(count) { if(count) return "test2.log/test.log"; return "test.log"; });
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "ENOTDIR: not a directory, stat 'test2.log/test.log'");
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
	});

	describe("wrong name generator (rotation)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { compress: "gzip", rotate: 1, size: "5B" }, function(count) { if(count) throw new Error("test"); return "test.log"; });
				self.rfs.write("test\n");
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "test");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});
	});

	describe("exhausted (rotation)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { compress: "gzip", rotate: 2, size: "5B" }, "test.log");
				var pre = self.rfs.findName;
				self.rfs.findName = function(a, b, c) { if(b) return c(Error("test")); pre.apply(self, arguments); };
				self.rfs.write("test\n");
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "test");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});
	});
});
