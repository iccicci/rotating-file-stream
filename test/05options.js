/* jshint mocha: true */
"use strict";

var assert = require("assert");
var fs = require("fs");
var rfs = require("./helper").rfs;

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
			var sec = parseInt(now / 1000) * 1000;

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
			var sec = parseInt(now / 1000) * 1000;

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
			var sec = parseInt(now / 1000) * 1000;

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
});
