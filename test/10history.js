"use strict";

var assert = require("assert");
var exec = require("./helper").exec;
var fs = require("fs");
var rfs = require("./helper").rfs;

describe("history", function() {
	describe("maxFiles", function() {
		before(function(done) {
			var self = this;
			var end = doneN(done, 2);
			exec(done, "rm -rf *log *txt ; echo none > test.log.txt ; echo -n test >> test.log.txt", function() {
				self.rfs = rfs(end, { size: "10B", maxFiles: 3 });
				self.rfs.on("removed", function(name, number) {
					self.removed = name;
					self.number = number;
					end();
				});
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.once("history", function() {
					self.rfs.write("test\n");
					self.rfs.write("test\n");
					self.rfs.once("history", function() {
						self.rfs.write("test\n");
						self.rfs.write("test\n");
						self.rfs.once("history", function() {
							self.rfs.write("test\n");
							self.rfs.write("test\n");
							self.rfs.once("history", function() {
								self.rfs.end("test\n");
							});
						});
					});
				});
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn, "File 'test' contained in history is not a regular file");
		});

		it("4 rotation", function() {
			assert.equal(this.rfs.ev.rotation.length, 4);
		});

		it("4 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 4);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("removed", function() {
			assert.equal(this.removed, "1-test.log");
			assert.equal(this.number, true);
		});

		it("removed first rotated file", function() {
			assert.equal(fs.existsSync("1-test.log"), false);
		});

		it("second rotated file content", function() {
			assert.equal(fs.readFileSync("2-test.log"), "test\ntest\n");
		});

		it("third rotated file content", function() {
			assert.equal(fs.readFileSync("3-test.log"), "test\ntest\n");
		});

		it("forth rotated file content", function() {
			assert.equal(fs.readFileSync("4-test.log"), "test\ntest\n");
		});
	});

	describe("maxSize", function() {
		before(function(done) {
			var self = this;
			var end = doneN(done, 2);
			exec(done, "rm -rf *log", function() {
				self.rfs = rfs(end, { size: "10B", maxSize: "35B", history: "history.log" });
				self.rfs.on("removed", function(name, number) {
					self.removed = name;
					self.number = number;
					end();
				});
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.once("history", function() {
					self.rfs.write("test\n");
					self.rfs.write("test\n");
					self.rfs.once("history", function() {
						self.rfs.write("test\n");
						self.rfs.write("test\n");
						self.rfs.once("history", function() {
							self.rfs.write("test\n");
							self.rfs.write("test\n");
							self.rfs.once("history", function() {
								self.rfs.end("test\n");
							});
						});
					});
				});
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("4 rotation", function() {
			assert.equal(this.rfs.ev.rotation.length, 4);
		});

		it("4 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 4);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("test.log"), "test\n");
		});

		it("removed", function() {
			assert.equal(this.removed, "1-test.log");
			assert.equal(this.number, false);
		});

		it("removed first rotated file", function() {
			assert.equal(fs.existsSync("1-test.log"), false);
		});

		it("second rotated file content", function() {
			assert.equal(fs.readFileSync("2-test.log"), "test\ntest\n");
		});

		it("third rotated file content", function() {
			assert.equal(fs.readFileSync("3-test.log"), "test\ntest\n");
		});

		it("forth rotated file content", function() {
			assert.equal(fs.readFileSync("4-test.log"), "test\ntest\n");
		});
	});

	describe("error reading history file", function() {
		before(function(done) {
			var self = this;
			exec(done, "rm -rf *log *txt", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", maxFiles: 1, history: "test" });
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.end("test\n");
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn.code, "EISDIR");
		});
	});

	describe("error writing history file", function() {
		before(function(done) {
			var self = this;
			var pre = fs.writeFile;
			var end = doneN(done, 2);
			fs.writeFile = function(a, b, c, d) {
				d("TEST");
			};
			exec(done, "rm -rf *log *txt", function() {
				self.rfs = rfs(end, { size: "10B", maxFiles: 1 });
				self.rfs.on("removed", function(name) {
					self.removed = name;
				});
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.end("test\n");
				self.rfs.once("warning", function() {
					fs.writeFile = pre;
					end();
				});
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn, "TEST");
		});
	});

	describe("error removing file", function() {
		before(function(done) {
			var self = this;
			var pre = fs.unlink;
			var end = doneN(done, 2);
			fs.unlink = function(a, b) {
				b("TEST");
			};
			exec(done, "rm -rf *log *txt", function() {
				self.rfs = rfs(end, { size: "10B", maxFiles: 1 });
				self.rfs.on("removed", function(name) {
					self.removed = name;
				});
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.once("warning", end);
				self.rfs.once("history", function() {
					self.rfs.write("test\n");
					self.rfs.write("test\n");
					self.rfs.once("history", function() {
						self.rfs.end("test\n");
						fs.unlink = pre;
					});
				});
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn, "TEST");
		});
	});

	describe("error checking file", function() {
		before(function(done) {
			var self = this;
			var preR = fs.readFile;
			var preS = fs.stat;
			exec(done, "rm -rf *log *txt", function() {
				self.rfs = rfs(setTimeout.bind(null, done, 100), { size: "10B", maxFiles: 1 });
				self.rfs.on("removed", function(name) {
					self.removed = name;
				});
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				setTimeout(function() {
					fs.readFile = function(a, b, c) {
						fs.stat = function(a, b) {
							fs.stat = preS;
							b("TEST");
						};
						fs.readFile = preR;
						fs.readFile(a, b, c);
					};
					self.rfs.write("test\n");
					self.rfs.write("test\n");
					self.rfs.end("test\n");
				}, 100);
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn, "TEST");
		});
	});

	describe("immutable", function() {
		var last;

		before(function(done) {
			var self = this;
			var end = doneN(done, 2);
			var day = 0;
			exec(done, "rm -rf *log *txt ; echo none > test.log.txt ; echo -n test >> test.log.txt", function() {
				self.rfs = rfs(end, { immutable: true, interval: "1d", size: "10B", maxFiles: 3 }, function(time, idx) {
					if(! time) return "test.log";
					var month = time.getFullYear() + "" + time.getMonth() + 1;
					var day = time.getDate();
					var hour = time.getHours();
					var minute = time.getMinutes();

					return month + day + "-" + hour + minute + "-" + idx + "test.log";
				});
				self.rfs.now = function() {
					if(++day % 3) return new Date();
					return new Date(2015, 0, day, 1, 29, 23, 123).getTime();
				};
				self.rfs.on("removed", function(name, number) {
					self.removed = name;
					self.number = number;
					end();
				});
				self.rfs.on("open", function(name) {
					last = name;
				});
				self.rfs.write("test\n");
				self.rfs.write("test\n");
				self.rfs.once("history", function() {
					self.rfs.write("test\n");
					self.rfs.write("test\n");
					self.rfs.once("history", function() {
						self.rfs.write("test\n");
						self.rfs.write("test\n");
						self.rfs.once("history", function() {
							self.rfs.write("test\n");
							self.rfs.write("test\n");
							self.rfs.once("history", function() {
								self.rfs.write("test\n");
								self.rfs.write("test\n");
								self.rfs.once("history", function() {
									self.rfs.end("test\n");
								});
							});
						});
					});
				});
			});
		});

		it("no error", function() {
			assert.ifError(this.rfs.ev.err);
		});

		it("warning", function() {
			assert.equal(this.rfs.ev.warn, "File 'test' contained in history is not a regular file");
		});

		it("5 rotation", function() {
			assert.equal(this.rfs.ev.rotation.length, 5);
		});

		it("5 rotated", function() {
			assert.equal(this.rfs.ev.rotated.length, 5);
		});

		it("file content", function() {
			assert.equal(fs.readFileSync("20150115-129-1test.log"), "test\n");
		});

		it("removed", function() {
			assert.equal(this.removed, "2015013-129-1test.log");
			assert.equal(this.number, true);
		});

		it("removed first rotated file", function() {
			assert.equal(fs.existsSync("2015013-129-1test.log"), false);
		});

		it("second rotated file content", function() {
			assert.equal(fs.readFileSync("2015016-129-1test.log"), "test\ntest\n");
		});

		it("third rotated file content", function() {
			assert.equal(fs.readFileSync("2015019-129-1test.log"), "test\ntest\n");
		});

		it("forth rotated file content", function() {
			assert.equal(fs.readFileSync("20150112-129-1test.log"), "test\ntest\n");
		});

		it("last file", function() {
			assert.equal(
				fs
					.readFileSync("test.log.txt")
					.toString()
					.split("\n")[2],
				last
			);
		});
	});
});
