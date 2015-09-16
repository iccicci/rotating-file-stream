"use strict";

var rfs = require("..");

module.exports = function(done, options) {
	var ret = rfs(function(time, index) { if(time) return index + "-test.log"; return "test.log"; }, options);

	ret.ev = { single: 0, multi: 0, rotation: 0, rotated: [] };
	ret.on("rotation", function() { ret.ev.rotation++; });
	ret.on("rotated", function(filename) { ret.ev.rotated.push(filename); });
	ret.on("error", function(err) { ret.ev.err = err; });
	ret.on("finish", done);

	var oldw = ret._write;
	var oldv = ret._writev;

	ret._write = function(chunk, encoding, callback) {
		ret.ev.single++;
		oldw.call(ret, chunk, encoding, callback);
	};

	ret._writev = function(chunks, callback) {
		ret.ev.multi++;
		oldv.call(ret, chunks, callback);
	};

	return ret;
};
