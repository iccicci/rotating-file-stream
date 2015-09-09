/* jshint mocha: true */
"use strict";

var assert = require("assert");
var rfs = require("..");

describe("rfs", function() {
	describe("new", function() {
		before(function(done) {
			this.rfs = rfs.createRotatingStream();
			done();
		});

		after(function() {
		});

		it("typeof", function() {
			assert.equal(typeof this.rfs, "object");
		});
	});
});
