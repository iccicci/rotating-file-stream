/* jshint mocha: true */
"use strict";

var assert = require("assert");
var exec = require("./helper").exec;
var fs = require("fs");
var rfs = require("./helper").rfs;

xdescribe("interval", function() {
	describe("_write while rotation", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log ; echo test > test.log", function() {
				var now  = new Date().getTime();
				var sec  = parseInt(now / 1000) * 1000;
				var open = sec + (sec + 900 > now ? 900 : 1900);
				console.log(new Date().getTime());
				setTimeout(function() {
					console.log(new Date().getTime());
					self.rfs = rfs(done, { interval: "1s" });
					self.rfs.on("rotation", function() {console.log(new Date().getTime());});
					self.rfs.on("finish", function() {console.log("finish");});
					self.rfs.on("rotation", self.rfs.end.bind(self.rfs, "test\n"));
				}, open - now);
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
			assert.equal(fs.readFileSync("1-test.log"), "test\n");
		});
	});

	describe("rotation while _write", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log ; echo test > test.log", function() {
				var now  = new Date().getTime();
				var sec  = parseInt(now / 1000) * 1000;
				var open = sec + (sec + 900 > now ? 900 : 1900);
				setTimeout(function() {
					self.rfs = rfs(done, { interval: "1s"});

					var prev = self.rfs.stream._write;
					self.rfs.stream._write = function(chunk, encoding, callback) {
						setTimeout(prev.bind(self.rfs.stream, chunk, encoding, callback), 200);
					};

					self.rfs.write("test\n");
					self.rfs.end("test\n");
				}, open - now);
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
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("1-test.log"), "test\ntest\n");
		});
	});
});
