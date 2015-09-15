/* jshint mocha: true */
"use strict";

var assert = require("assert");
var fs = require("fs");
var rfs = require("..");
var Writable = require("stream").Writable;

function rfsh(options) {
	var ret = rfs(function(time, index) { if(time) return index + "-test.log"; return "test.log"; }, options);

	ret.ev = { single: 0, multi: 0, rotation: 0, rotated: [] };
	ret.on("rotation", function() { ret.ev.rotation++; });
	ret.on("rotated", function(filename) { ret.ev.rotated.push(filename); });
	ret.on("error", function(err) { ret.ev.err = err; });

	var oldw = ret._write;
	var oldv = ret._writev;

	ret._write = function(chunk, encoding, callback) {
		ret.ev.single++;
		oldw.call(ret, chunk, encoding, callback);
	};

	ret._writev = function(chunks, callback) {
		ret.ev.multi++;
		oldv.call(ret, chunks, callback);
	};

	return ret;
}

describe("write", function() {
	describe("single write", function() {
		before(function(done) {
			this.rfs = rfsh();
			this.rfs.end("test\n");
			this.rfs.on("finish", done);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
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

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});
	});

	describe("multi write", function() {
		before(function(done) {
			this.rfs = rfsh();
			this.rfs.write("test\n");
			this.rfs.write("test\n");
			this.rfs.end("test\n");
			this.rfs.on("finish", done);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		if(process.version.match(/^v0.10/)) {
			it("4 single write", function() {
				assert.equal(this.rfs.ev.single, 4);
			});

			it("0 multi write", function() {
				assert.equal(this.rfs.ev.multi, 0);
			});
		}
		else {
			it("1 single write", function() {
				assert.equal(this.rfs.ev.single, 1);
			});

			it("1 multi write", function() {
				assert.equal(this.rfs.ev.multi, 1);
			});
		}

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\ntest\ntest\ntest\n");
		});
	});

	describe("initial rotation", function() {
		before(function(done) {
			this.rfs = rfsh({ size: "10B" });
			this.rfs.end("test\n");
			this.rfs.on("finish", done);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
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
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("1-test.log"), "test\ntest\ntest\ntest\n");
		});
	});

	describe("single write rotation by size", function() {
		before(function(done) {
			this.rfs = rfsh({ size: "10B" });
			this.rfs.end("test\n");
			this.rfs.on("finish", done);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("1 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 1);
			assert.equal(this.rfs.ev.rotated[0], "2-test.log");
		});

		it("3 single write", function() {
			assert.equal(this.rfs.ev.single, 3);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("2-test.log"), "test\ntest\n");
		});
	});

	describe("multi write rotation by size", function() {
		before(function(done) {
			this.rfs = rfsh({ size: "10B" });
			this.rfs.write("test\n");
			this.rfs.write("test\n");
			this.rfs.end("test\n");
			this.rfs.on("finish", done);
			setTimeout(done, 1500);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("1 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 1);
			assert.equal(this.rfs.ev.rotated[0], "3-test.log");
		});

		if(process.version.match(/^v0.10/)) {
			it("5 single write", function() {
				assert.equal(this.rfs.ev.single, 5);
			});

			it("0 multi write", function() {
				assert.equal(this.rfs.ev.multi, 0);
			});
		}
		else {
			it("2 single write", function() {
				assert.equal(this.rfs.ev.single, 2);
			});

			it("1 multi write", function() {
				assert.equal(this.rfs.ev.multi, 1);
			});
		}

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("3-test.log"), "test\ntest\n");
		});
	});

	describe("no rotating single write with end", function() {
		before(function(done) {
			this.rfs = rfsh({ size: "20B" });
			this.rfs.end("test\n");
			this.rfs.on("finish", done);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
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

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\ntest\n");
		});
	});
});
