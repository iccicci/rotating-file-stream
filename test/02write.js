/* jshint mocha: true */
"use strict";

var assert = require("assert");
var fs = require("fs");
var rfs = require("./helper");

describe("write", function() {
	describe("single write", function() {
		before(function(done) {
			this.rfs = rfs(done);
			this.rfs.end("test\n");
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

	describe("multi write", function() {
		before(function(done) {
			this.rfs = rfs(done);
			this.rfs.write("test\n");
			this.rfs.write("test\n");
			this.rfs.end("test\n");
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
});
