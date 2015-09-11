"use strict";

var util = require("util");
var Writable = require("stream").Writable;

function RotatingFileStream(options) {
	if(! (this instanceof RotatingFileStream))
		return new RotatingFileStream(options);

	Writable.call(this);
}

util.inherits(RotatingFileStream, Writable);

module.exports = RotatingFileStream;
