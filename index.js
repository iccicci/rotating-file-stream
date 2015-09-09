"use strict";

var util = require("util");
var Writable = require("stream").Writable;

function RotatingFileStream(option) {
}

util.inherits(RotatingFileStream, Writable);

module.exports = {
	createRotatingStream: function(options) { return new RotatingFileStream(options); }
};
