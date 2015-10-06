/* jshint mocha: true */
"use strict";

var assert = require("assert");
var cp     = require("child_process");
var exec   = require("./helper").exec;
var fs     = require("fs");
var rfs    = require("./helper").rfs;

describe("compression", function() {
	describe("external", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", compress: true });
				self.rfs.write("test\n");
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
			assert.equal(this.rfs.ev.rotated[0], "1-test.log");
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});

		it("rotated file content", function(done) {
			cp.exec("zcat " + this.rfs.ev.rotated[0], function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\n");
				done();
			});
		});
	});

	describe("missing path", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", compress: true }, function(time) { if(time) return "log/test.log"; return "test.log"; });
				self.rfs.write("test\n");
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
			assert.equal(this.rfs.ev.rotated[0], "log/test.log");
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});

		it("rotated file content", function(done) {
			cp.exec("zcat " + this.rfs.ev.rotated[0], function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\n");
				done();
			});
		});
	});

	describe("missing path (error)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log ; mkdir log ; chmod 555 log", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", compress: true }, function(time) { if(time) return "log/t/test.log"; return "test.log"; });
				self.rfs.write("test\n");
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "EACCES");
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
