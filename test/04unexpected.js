/* jshint mocha: true */
"use strict";

var assert = require("assert");
var fs = require("fs");
var rfs = require("./helper");

describe("unexpected", function() {
	describe("single write after error", function() {
		before(function(done) {
			var t = this;

			this.rfs = rfs(setTimeout.bind(null, done, 100));
			this.rfs.stream.write = function(buffer, callback) { process.nextTick(callback.bind(null, new Error("test"))); };
			this.rfs.write("test\n");
			this.rfs.once("error", function() {
				try {
					t.rfs._write("", "buffer", function() {});
				}
				catch(e) {
					t.err = e;
				}
			});
		});

		it("test error", function() {
			assert.equal(this.rfs.ev.err.message, "test");
			assert.equal(this.err.message, "Unexpected case ( https://www.npmjs.com/package/rotating-file-stream#unexpected ): _write after error");
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

	describe("single write before callback", function() {
		before(function(done) {
			this.rfs = rfs(done, { size: "5B" });
			this.rfs.callback = function() {};
			try {
				this.rfs.end("test\n");
			}
			catch(e) {
				this.err = e;
				setTimeout(done, 50);
			}
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("Error", function() {
			assert.equal(this.err.message, "Unexpected case ( https://www.npmjs.com/package/rotating-file-stream#unexpected ): _write before callback");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("1 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 1);
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

	describe("multi write after error", function() {
		before(function(done) {
			var t = this;

			this.rfs = rfs(setTimeout.bind(null, done, 100));
			this.rfs.stream.write = function(buffer, callback) { process.nextTick(callback.bind(null, new Error("test"))); };
			this.rfs.write("test\n");
			this.rfs.once("error", function() {
				try {
					t.rfs._writev([{ chunk: "", encoding: "buffer" }], function() {});
				}
				catch(e) {
					t.err = e;
				}
			});
		});

		it("test error", function() {
			assert.equal(this.rfs.ev.err.message, "test");
			assert.equal(this.err.message, "Unexpected case ( https://www.npmjs.com/package/rotating-file-stream#unexpected ): _writev after error");
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

		it("1 multi write", function() {
			assert.equal(this.rfs.ev.multi, 1);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});
	});

	describe("multi write before callback", function() {
		before(function(done) {
			this.rfs = rfs(done);
			this.rfs.callback = function() {};
			try {
				this.rfs._writev("", "buffer", function() {});
			}
			catch(e) {
				this.err = e;
				this.rfs.callback = null;
				this.rfs.end("test\n");
			}
		});

		it("test error", function() {
			assert.ifError(this.rfs.ev.err);
			assert.equal(this.err.message, "Unexpected case ( https://www.npmjs.com/package/rotating-file-stream#unexpected ): _writev before callback");
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

		it("1 multi write", function() {
			assert.equal(this.rfs.ev.multi, 1);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});
	});

	describe("multi write on initial rotation", function() {
		before(function(done) {
			this.rfs = rfs(done, { size: "5B" });
			try {
				this.rfs._writev("", "buffer", function() {});
			}
			catch(e) {
				this.err = e;
				setTimeout(this.rfs.end.bind(this.rfs, "test\n"), 50);
			}
		});

		it("test error", function() {
			assert.ifError(this.rfs.ev.err);
			assert.equal(this.err.message, "Unexpected case ( https://www.npmjs.com/package/rotating-file-stream#unexpected ): _writev while initial rotation");
		});

		it("2 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 2);
		});

		it("2 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 2);
		});

		it("1 single write", function() {
			assert.equal(this.rfs.ev.single, 1);
		});

		it("1 multi write", function() {
			assert.equal(this.rfs.ev.multi, 1);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});
	});
});
