"use strict";

var assert = require("assert");
var cp = require("child_process");
var exec = require("./helper").exec;
var fs = require("fs");
var rfs = require("./helper").rfs;

describe("use cases", function() {
	var pad = function(num) {
		return (num > 9 ? "" : "0") + num;
	};

	describe("use case", function() {
		before(function(done) {
			var cnt = 0;
			var self = this;
			exec(done, "rm -rf *log *gz", function() {
				self.rfs = rfs(done, { size: "10B", compress: true, interval: "1d" }, function(time, index) {
					if(! time) return "test.log";

					var year = time.getFullYear();
					var month = pad(time.getMonth() + 1);
					var day = pad(time.getDate());

					return year + "-" + month + "-" + day + "-test-" + pad(index) + ".log.gz";
				});
				var prev = self.rfs.now;
				self.rfs.now = function() {
					cnt++;
					if(cnt === 1 || cnt === 2) return new Date(1976, 0, 23, 23, 59, 59, 700).getTime();
					if(cnt === 3 || cnt === 4) return new Date(1976, 0, 24, 23, 59, 59, 100).getTime();
					if(cnt === 5 || cnt === 6) return new Date(1976, 0, 24, 23, 59, 59, 200).getTime();
					return new Date(1976, 0, 25, 23, 59, 59, 100).getTime();
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
			assert.equal(this.rfs.ev.rotation.length, 3);
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

	describe("double makePath", function() {
		before(function(done) {
			var self = this;
			var end = function() {
				self.rfs1.end("test\n");
			};
			exec(done, "rm -rf *log", function() {
				self.rfs1 = rfs(done, { path: "log/double", size: "15B" }, "test1.log");
				self.rfs2 = rfs(end, { path: "log/double", size: "15B" }, "test2.log");
				self.rfs2.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs1.ev.err);
			assert.ifError(this.rfs2.ev.err);
		});

		it("0 rotation", function() {
			assert.equal(this.rfs1.ev.rotation.length, 0);
			assert.equal(this.rfs2.ev.rotation.length, 0);
		});

		it("2 single write", function() {
			assert.equal(this.rfs1.ev.single, 1);
			assert.equal(this.rfs2.ev.single, 1);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs1.ev.multi, 0);
			assert.equal(this.rfs2.ev.multi, 0);
		});

		it("files content", function() {
			assert.equal(fs.readFileSync("log/double/test1.log"), "test\n");
			assert.equal(fs.readFileSync("log/double/test2.log"), "test\n");
		});
	});

	describe("monthly rotation", function() {
		before(function(done) {
			var cnt = 0;
			var self = this;
			exec(done, "rm -rf *log *gz", function() {
				self.rfs = rfs(done, { size: "10B", interval: "2M" }, function(time, index) {
					if(! time) return "test.log";

					var year = time.getFullYear();
					var month = pad(time.getMonth() + 1);
					var day = pad(time.getDate());

					return year + "-" + month + "-" + day + "-test-" + pad(index) + ".log";
				});
				var prev = self.rfs.now;
				self.rfs.maxTimeout = 200;
				self.rfs.now = function() {
					cnt++;
					if(cnt === 1 || cnt === 2) return new Date(1976, 0, 23, 0, 0, 0, 0).getTime();
					if(cnt === 3) return new Date(1976, 1, 1, 0, 0, 0, 0).getTime();
					if(cnt === 4) return new Date(1976, 1, 29, 23, 59, 59, 950).getTime();
					if(cnt === 5 || cnt === 6) return new Date(1976, 2, 1, 0, 0, 0, 0).getTime();
					if(cnt === 7 || cnt === 8) return new Date(1976, 2, 10, 0, 0, 0, 0).getTime();
					if(cnt === 9) return new Date(1976, 3, 30, 23, 59, 59, 950).getTime();
					return new Date(1976, 4, 1, 0, 0, 0, 0).getTime();
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
			assert.equal(this.rfs.ev.rotation.length, 3);
		});

		it("3 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 3);
			assert.equal(this.rfs.ev.rotated[0], "1976-01-01-test-01.log");
			assert.equal(this.rfs.ev.rotated[1], "1976-03-01-test-01.log");
			assert.equal(this.rfs.ev.rotated[2], "1976-03-01-test-02.log");
		});

		it("5 single write", function() {
			assert.equal(this.rfs.ev.single, 5);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("files content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
			assert.equal(fs.readFileSync("1976-01-01-test-01.log"), "test\n");
			assert.equal(fs.readFileSync("1976-03-01-test-01.log"), "test\ntest\n");
			assert.equal(fs.readFileSync("1976-03-01-test-02.log"), "test\n");
		});
	});
});
