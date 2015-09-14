/* jshint mocha: true */
"use strict";

var assert = require("assert");
var rfs = require("..");
var Writable = require("stream").Writable;

describe("rfs", function() {
	describe("new", function() {
		before(function(done) {
			this.rfs = rfs("test.log");
			done();
		});

		it("constructor", function() {
			assert.equal(this.rfs instanceof rfs, true);
		});

		it("Writable", function() {
			assert.equal(this.rfs instanceof Writable, true);
		});
	});

	describe("wrong filename type", function() {
		before(function(done) {
			try {
				this.rfs = rfs({});
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Don't know how to handle 'filename' type: object");
		});
	});

	describe("no options", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log");
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("no error", function() {
			assert.equal(this.err, null);
		});
	});

	describe("wrong options type", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", "test.log");
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Don't know how to handle 'options' type: string");
		});
	});

	describe("unknown option", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { test: true });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Unknown option: test");
		});
	});

	describe("no compress value", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { compress: false });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "A value for 'options.compress' must be specified");
		});
	});

	describe("wrong compress type", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { compress: 23 });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Don't know how to handle 'options.compress' type: number");
		});
	});

	describe("wrong compression method", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { compress: "test" });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Don't know how to handle compression method: test");
		});
	});

	describe("wrong interval type", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { interval: 23 });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Don't know how to handle 'options.interval' type: number");
		});
	});

	describe("wrong size type", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { size: 23 });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Don't know how to handle 'options.size' type: number");
		});
	});

	describe("wrong size format", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { size: "test" });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Unknown 'options.size' format: test");
		});
	});

	describe("wrong size number", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { size: "-23" });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "A positive integer number is expected for 'options.size'");
		});
	});

	describe("missing size unit", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { size: "23" });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Missing unit for 'options.size'");
		});
	});

	describe("wrong size unit", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { size: "23test" });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "Unknown 'options.size' unit: t");
		});
	});

	describe("wrong interval minutes number", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { interval: "23m" });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "An integer divider of 60 is expected as minutes for 'options.interval'");
		});
	});

	describe("wrong interval hours number", function() {
		before(function(done) {
			try {
				this.rfs = rfs("test.log", { interval: "23h" });
			}
			catch(e) {
				this.err = e;
			}
			done();
		});

		it("error", function() {
			assert.equal(this.err.message, "An integer divider of 24 is expected as hours for 'options.interval'");
		});
	});
});
