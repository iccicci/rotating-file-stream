/* jshint mocha: true */
"use strict";

var assert = require("assert");
var fs = require("fs");
var rfs = require("./helper");

describe("interval", function() {
	describe("by interval", function() {
		before(function(done) {
			var now  = new Date().getTime();
			var sec  = parseInt(now / 1000) * 1000;
			var open = sec + (sec + 500 > now ? 500 : 1500);
			var self = this;
			setTimeout(function() {
				self.rfs = rfs(done, { interval: "1s" });
				setTimeout(self.rfs.end.bind(self.rfs), 600);
			}, open - now);
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("1 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 1);
			assert.equal(this.rfs.ev.rotated[0], "7-test.log");
		});

		it("0 single write", function() {
			assert.equal(this.rfs.ev.single, 0);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("7-test.log"), "test\n");
		});
	});
});
