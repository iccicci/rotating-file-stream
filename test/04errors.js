"use strict";

var assert = require("assert");
var exec   = require("./helper").exec;
var fs     = require("fs");
var rfs    = require("./helper").rfs;

describe("errors", function() {
	describe("wrong name generator (first time)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "10B" }, function() { throw new Error("test"); });
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "test");
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
	});

	describe("wrong name generator (rotation)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "15B" }, function(time) { if(time) throw new Error("test"); return "test.log"; });
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "test");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
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
			it("1 single write", function() {
				assert.equal(this.rfs.ev.single, 1);
			});

			it("1 multi write", function() {
				assert.equal(this.rfs.ev.multi, 1);
			});
		}

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\ntest\ntest\n");
		});
	});

	describe("logging on directory", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "5B" }, "test");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Can't write on: test (it is not a file)");
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("0 single write", function() {
			assert.equal(this.rfs.ev.single, 0);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});
	});

	describe("using file as directory", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "5B" }, "index.js/test.log");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "ENOTDIR");
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("0 single write", function() {
			assert.equal(this.rfs.ev.single, 0);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});
	});

	describe("no rotated file available", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "5B" }, function(time, index) { return "test.log"; });
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Too many destination file attempts");
			assert.equal(this.rfs.err.attempts["test.log"], 1000);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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

	describe("no rotated file available (initial rotation)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log ; echo test > test.log", function() {
				self.rfs = rfs(done, { size: "5B" }, function(time, index) { return "test.log"; });
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Too many destination file attempts");
			assert.equal(this.rfs.err.attempts["test.log"], 1000);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("0 single write", function() {
			assert.equal(this.rfs.ev.single, 0);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});
	});

	describe("error while write", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { interval: "10d" });
				self.rfs.once("open", function() {
					self.rfs.stream.write = function(buffer, callback) { process.nextTick(callback.bind(null, new Error("Test error"))); };
					self.rfs.end("test\n");
				});
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Test error");
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
			assert.equal(fs.readFileSync("test.log"), "");
		});
	});

	describe("error while rename", function() {
		before(function(done) {
			var self  = this;
			var oldR  = fs.rename;
			fs.rename = function(a, b, callback) { process.nextTick(callback.bind(null, new Error("Test error"))); };
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(function() { fs.rename = oldR; done(); }, { size: "5B" });
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.message, "Test error");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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

	describe("missing path creation", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "10B" }, function(time) { if(time) return "log/t/rot/test.log"; return "log/t/test.log"; });
				self.rfs.write("test\n");
				self.rfs.write("test\n");
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
			assert.equal(this.rfs.ev.rotated[0], "log/t/rot/test.log");
		});

		if(process.version.match(/^v0.10/)) {
			it("3 single write", function() {
				assert.equal(this.rfs.ev.single, 3);
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
			assert.equal(fs.readFileSync("log/t/test.log"), "test\n");
		});

		it("rotated file content", function() {
			assert.equal(fs.readFileSync("log/t/rot/test.log"), "test\ntest\n");
		});
	});

	describe("error creating missing path in first open", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log ; mkdir log ; chmod 555 log", function() {
				self.rfs = rfs(done, {}, function() { return "log/t/test.log"; });
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "EACCES");
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("0 single write", function() {
			assert.equal(this.rfs.ev.single, 0);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});
	});

	describe("error creating missing path in rotation", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log ; mkdir log ; chmod 555 log", function() {
				self.rfs = rfs(done, { size: "5B" }, function(time) { if(time) return "log/t/test.log"; return "test.log"; });
				self.rfs.end("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "EACCES");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});

	describe("error on no rotated file open", function() {
		before(function(done) {
			var self = this;
			var oldC = fs.createWriteStream;
			fs.createWriteStream = function() {
				return { once: function(event, callback) {
					if(event === "error")
						setTimeout(callback.bind(null, { code: "TEST" }), 50);
				} };
			};
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(function() { fs.createWriteStream = oldC; done(); });
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("0 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 0);
		});

		it("0 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 0);
		});

		it("0 single write", function() {
			assert.equal(this.rfs.ev.single, 0);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});
	});

	describe("error unlinking file", function() {
		before(function(done) {
			var self = this;
			var oldU = fs.unlink;
			exec(done, "rm -rf *log", function() {
				fs.unlink = function(path, callback) {
					setTimeout(function() {
						fs.unlink = oldU;
						setTimeout(done, 50);
						callback({ code: "TEST" });
					}, 50);
				};
				self.rfs = rfs(function() {}, { size: "5B", compress: "gzip" });
				self.rfs.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn.code, "TEST");
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
	});

	describe("error unlinking external compression file", function() {
		before(function(done) {
			var self = this;
			var oldU = fs.unlink;
			exec(done, "rm -rf *log", function() {
				fs.unlink = function(path, callback) {
					setTimeout(function() {
						fs.unlink = oldU;
						callback({ code: "TEST" });
					}, 50);
				};
				self.rfs = rfs(done, { size: "5B", compress: true });
				self.rfs.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn.code, "TEST");
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
	});

	describe("error in external compression function", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "5B", compress: function() { var e = new Error("test"); e.code = "TEST"; throw e; } });
				self.rfs.write("test\n");
			});
		});

		it("error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("no warning", function() {
			assert.ifError(this.rfs.ev.warn);
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});
});
