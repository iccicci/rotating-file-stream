/* jshint mocha: true */
"use strict";

var assert = require("assert");
var rfs = require("..");

describe("rfs", function() {
	describe("new", function() {
		before(function(done) {
			this.rfs = rfs();
			console.log(parseInt("666", 8));
			done();
		});

		after(function() {
		});

		it("constructor", function() {
			assert.equal(this.rfs instanceof rfs, true);
		});
	});
});
