"use strict";

var assert = require("assert");
var exec   = require("./helper").exec;
var fs     = require("fs");
var rfs    = require("./helper").rfs;

describe("options", function() {
	describe("size KiloBytes", function() {
		before(function(done) {
			this.rfs = rfs(done, { size: "10K" });
			this.rfs.end();
		});

		it("10K", function() {
			assert.equal(this.rfs.options.size, 10240);
		});
	});

	describe("size MegaBytes", function() {
		before(function(done) {
			this.rfs = rfs(done, { size: "10M" });
			this.rfs.end();
		});

		it("10M", function() {
			assert.equal(this.rfs.options.size, 10485760);
		});
	});

	describe("size GigaBytes", function() {
		before(function(done) {
			this.rfs = rfs(done, { size: "10G" });
			this.rfs.end();
		});

		it("10G", function() {
			assert.equal(this.rfs.options.size, 10737418240);
		});
	});

	describe("interval minutes", function() {
		before(function(done) {
			var self = this;
			var doIt = function() {
				self.rfs = rfs(done, { interval: "3m" });
				self.rfs.end();
			};

			var now = new Date().getTime();
			var sec = parseInt(now / 1000, 10) * 1000;

			if(now - sec < 900)
				return doIt();

			setTimeout(doIt, 101);
		});

		it("3'", function() {
			assert.equal(this.rfs.options.interval.num, 3);
			assert.equal(this.rfs.options.interval.unit, "m");
		});
	});

	describe("interval hours", function() {
		before(function(done) {
			var self = this;
			var tz   = process.env.TZ;
			var doIt = function() {
				self.rfs = rfs(done, { interval: "3h" });
				setTimeout(function() {
					process.env.TZ = "Europe/Rome";
					self.rfs._interval(new Date(2015, 2, 29, 1, 29, 23, 123).getTime());
					process.env.TZ = tz;
					self.rfs.end();
				}, 30);
			};

			var now = new Date().getTime();
			var sec = parseInt(now / 1000, 10) * 1000;

			if(now - sec < 900)
				return doIt();

			setTimeout(doIt, 101);
		});

		it("3h", function() {
			assert.equal(this.rfs.options.interval.num, 3);
			assert.equal(this.rfs.options.interval.unit, "h");
		});

		it("hours daylight saving", function() {
			assert.equal(this.rfs.next - this.rfs.prev, 7200000);
		});
	});

	describe("interval days", function() {
		before(function(done) {
			var self = this;
			var tz   = process.env.TZ;
			var doIt = function() {
				self.rfs = rfs(done, { interval: "3d" });
				setTimeout(function() {
					process.env.TZ = "Europe/Rome";
					self.rfs._interval(new Date(2015, 2, 29, 1, 29, 23, 123).getTime());
					process.env.TZ = tz;
					self.rfs.end();
				}, 30);
			};

			var now = new Date().getTime();
			var sec = parseInt(now / 1000, 10) * 1000;

			if(now - sec < 900)
				return doIt();

			setTimeout(doIt, 101);
		});

		it("3d", function() {
			assert.equal(this.rfs.options.interval.num, 3);
			assert.equal(this.rfs.options.interval.unit, "d");
		});

		it("days daylight saving", function() {
			assert.equal(this.rfs.next - this.rfs.prev, 255600000);
		});
	});

	describe("path", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf /tmp/test.log /tmp/1-test.log ; echo test > /tmp/test.log", function() {
				self.rfs = rfs(done, { path: "/tmp", size: "10B" });
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
			assert.equal(this.rfs.ev.rotated[0], "/tmp/1-test.log");
		});

		it("1 single write", function() {
			assert.equal(this.rfs.ev.single, 1);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("/tmp/test.log"), "");
		});

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("/tmp/1-test.log"), "test\ntest\n");
		});
	});

	describe("safe options object", function() {
		before(function(done) {
			this.options = { size: "10M", interval: "30s", rotate: 5 };
			this.rfs = rfs(done, this.options);
			this.rfs.end();
		});

		it("10M", function() {
			assert.equal(this.options.size, "10M");
		});

		it("30s", function() {
			assert.equal(this.options.interval, "30s");
		});

		it("5 rotate", function() {
			assert.equal(this.options.rotate, 5);
		});
	});
});
