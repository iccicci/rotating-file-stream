/* jshint mocha: true */
"use strict";

var assert = require("assert");
var fs = require("fs");
var rfs = require("..");
var Writable = require("stream").Writable;

function rfsh(filename, options) {
	var ret = rfs(filename, options);

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
			this.rfs = rfsh("test.log");
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

	describe("double write", function() {
		before(function(done) {
			this.rfs = rfsh("test.log");
			this.rfs.write("test\n");
			this.rfs.write("test\n");
			this.rfs.end("test\n");
			this.rfs.on("finish", done);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("no rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
		});

		it("no rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("1 single write", function() {
			assert.equal(this.rfs.ev.single, 1);
		});

		it("1 multi write", function() {
			assert.equal(this.rfs.ev.multi, 1);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\ntest\ntest\ntest\n");
		});
	});
});
