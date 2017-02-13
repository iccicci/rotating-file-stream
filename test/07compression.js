"use strict";

var assert = require("assert");
var cp     = require("child_process");
var exec   = require("./helper").exec;
var fs     = require("fs");
var rfs    = require("./helper").rfs;

describe("compression", function() {
	describe("external", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(function() {}, { size: "10B", compress: true }, function(time, idx) {
					if(time) return "test.log/" + idx; return "test.log/log"; });
				self.rfs.write("test\n");
				self.rfs.end("test\n");
				self.rfs.on("rotated", function() { done(); });
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
			assert.equal(this.rfs.ev.rotated[0], "test.log/1");
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log/log"), "");
		});

		it("rotated file content", function(done) {
			cp.exec("zcat " + this.rfs.ev.rotated[0], function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\n");
				done();
			});
		});
	});

	describe("external custom", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", compress: function(source, dest) {
			        return "cat " + source + " | gzip -c9 > " + dest + ".log";
			    }});
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
			assert.equal(this.rfs.ev.rotated[0], "1-test.log");
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});

		it("rotated file content", function(done) {
			cp.exec("zcat " + this.rfs.ev.rotated[0] + ".log", function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\n");
				done();
			});
		});
	});

	describe("internal (gzip)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", compress: "gzip" });
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
			assert.equal(this.rfs.ev.rotated[0], "1-test.log");
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});

		it("rotated file content", function(done) {
			cp.exec("zcat " + this.rfs.ev.rotated[0], function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\n");
				done();
			});
		});
	});

	describe("missing path", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", compress: true }, function(time) { if(time) return "log/test.log"; return "test.log"; });
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
			assert.equal(this.rfs.ev.rotated[0], "log/test.log");
		});

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "");
		});

		it("rotated file content", function(done) {
			cp.exec("zcat " + this.rfs.ev.rotated[0], function(error, stdout, stderr) {
				assert.equal(stdout, "test\ntest\n");
				done();
			});
		});
	});

	describe("missing path (error)", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log ; mkdir log ; chmod 555 log", function() {
				self.rfs = rfs(done, { size: "10B", compress: true }, function(time) { if(time) return "log/t/test.log"; return "test.log"; });
				self.rfs.write("test\n");
				self.rfs.write("test\n");
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

		it("2 single write", function() {
			assert.equal(this.rfs.ev.single, 2);
		});

		it("0 multi write", function() {
			assert.equal(this.rfs.ev.multi, 0);
		});
	});

	describe("missing path (error2)", function() {
		before(function(done) {
			var self = this;
			var preO;
			var preT;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(function() {
					fs.open = preO;
					done();
				}, { size: "10B", compress: true });
				preT = self.rfs.touch;
				self.rfs.touch = function(name, callback, retry) {
					preO = fs.open;
					fs.open = function(a, b, c) { var e = new Error("test"); e.code = "TEST"; c(e); };
					preT.call(this, name, callback, retry);
				};
				self.rfs.write("test\n");
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});

	describe("can't find rotated file name", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "10B", compress: true }, function(time) { if(time) return "index.js"; return "test.log"; });
				self.rfs.write("test\n");
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "RFS-TOO-MANY");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});

	describe("error creating tmp file", function() {
		before(function(done) {
			var self = this;
			var preO = fs.open;
			fs.open  = function(path, flags, mode, cb) {
				if(mode !== parseInt("777", 8))
					return preO.apply(fs, arguments);
				var e   = new Error("test");
				fs.open = preO;
				e.code  = "TEST";
				cb(e);
			};
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "10B", compress: true });
				self.rfs.write("test\n");
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});

	describe("error writing tmp file", function() {
		before(function(done) {
			var self = this;
			var preT;
			var preW = fs.write;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(function() {
					fs.write = preW;
					done();
				}, { size: "10B", compress: true });
				preT = self.rfs.touch;
				self.rfs.touch = function(name, callback, retry) {
					fs.write = function(a, b, c) { var e = new Error("test"); e.code = "TEST"; c(e); };
					preT.call(this, name, callback, retry);
				};
				self.rfs.write("test\n");
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});

	describe("error writing and closing tmp file", function() {
		before(function(done) {
			var self = this;
			var preC = fs.close;
			var preT;
			var preW = fs.write;
			var e    = new Error("test");
			e.code   = "TEST";
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "10B", compress: true });
				preT = self.rfs.touch;
				self.rfs.touch = function(name, callback, retry) {
					fs.close = function(a, b)    { fs.close = preC; b(e); };
					fs.write = function(a, b, c) { fs.write = preW; c(e); };
					preT.call(this, name, callback, retry);
				};
				self.rfs.write("test\n");
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("Warning", function() {
			assert.equal(this.rfs.ev.warn.code, "TEST");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});

	describe("error closing tmp file", function() {
		before(function(done) {
			var self = this;
			var preT;
			var preC = fs.close;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "10B", compress: true });
				preT = self.rfs.touch;
				self.rfs.touch = function(name, callback, retry) {
					fs.close = function(a, c) { var e = new Error("test"); e.code = "TEST"; fs.close = preC; c(e); };
					preT.call(this, name, callback, retry);
				};
				self.rfs.write("test\n");
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});

	describe("error finding external tmp file", function() {
		before(function(done) {
			var self = this;
			var preF;
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(done, { size: "10B", compress: true });
				preF = self.rfs.findName;
				self.rfs.findName = function(att, tmp, callback) {
					if(! ('1-test.log' in att))
						return preF.apply(this, arguments);
					var e  = new Error("test");
					e.code = "TEST";
					callback(e);
				};
				self.rfs.write("test\n");
				self.rfs.write("test\n");
			});
		});

		it("Error", function() {
			assert.equal(this.rfs.err.code, "TEST");
		});

		it("1 rotation", function() {
			assert.equal(this.rfs.ev.rotation, 1);
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
	});
});
