"use strict";

var assert = require("assert");
var cp     = require("child_process");
var exec   = require("./helper").exec;
var fs     = require("fs");
var rfs    = require("./helper").rfs;

describe("use", function() {
	describe("case", function() {
		before(function(done) {
			var cnt  = 0;
			var pad  = function(num) { return (num > 9 ? "" : "0") + num; };
			var self = this;
			exec(done, "rm -rf *log *gz", function() {
				self.rfs = rfs(done, { size: "10B", compress: true, interval: "1d" }, function(time, index) {
					if(! time)
						return "test.log";

					var year  = time.getFullYear();
					var month = pad(time.getMonth() + 1);
					var day   = pad(time.getDate());

					return year + "-" + month + "-" + day + "-test-" + pad(index) + ".log.gz";
				});
				var prev = self.rfs.now;
				self.rfs.now = function() {
					cnt++;
					if(cnt === 1) return new Date(1976, 0, 23, 23, 59, 59, 700).getTime();
					if(cnt === 2) return new Date(1976, 0, 24, 23, 59, 59, 100).getTime();
					if(cnt === 3) return new Date(1976, 0, 24, 23, 59, 59, 200).getTime();
					if(cnt === 4) return new Date(1976, 0, 25, 23, 59, 59, 100).getTime();
				};
				self.rfs.write("test\n");
				self.rfs.once("rotated", function() {
					self.rfs.write("test\n");
					self.rfs.write("test\n");
					self.rfs.once("rotated", function() {
						self.rfs.write("test\n");
						self.rfs.once("rotated", function() {
							self.rfs.end("test\n");
						});
					});
				});
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
			assert.equal(this.rfs.ev.rotated[0], "1976-01-23-test-01.log.gz");
			assert.equal(this.rfs.ev.rotated[1], "1976-01-24-test-01.log.gz");
			assert.equal(this.rfs.ev.rotated[2], "1976-01-24-test-02.log.gz");
		});

		it("5 single write", function() {
			assert.equal(this.rfs.ev.single, 5);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("rotated file content", function(done) {
			var self = this;
			cp.exec("zcat " + self.rfs.ev.rotated[0], function(error, stdout, stderr) {
				assert.equal(stdout, "test\n");
				cp.exec("zcat " + self.rfs.ev.rotated[1], function(error, stdout, stderr) {
					assert.equal(stdout, "test\ntest\n");
					cp.exec("zcat " + self.rfs.ev.rotated[2], function(error, stdout, stderr) {
						assert.equal(stdout, "test\n");
						done();
					});
				});
			});
		});
	});
});
