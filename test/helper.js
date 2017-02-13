"use strict";

var cp  = require("child_process");
var rfs = require("..");

function exec(done, cmd, cb) {
	cp.exec(cmd, function(error, stdout, stderr) {
		if(error) {
			console.log(error, stdout, stderr);

			return done();
		}

		cb();
	});
}

function _rfs(done, options, generator) {
	var ret = rfs(generator || function(time, index) { if(time) return index + "-test.log"; return "test.log"; }, options);

	ret.ev = { single: 0, multi: 0, rotation: 0, rotated: [] };
	ret.on("rotation", function() { ret.ev.rotation++; });
	ret.on("rotated", function(filename) { ret.ev.rotated.push(filename); });
	ret.once("warning", function(err) { ret.ev.warn = err; });
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
}

module.exports = {
	exec: exec,
	rfs:  _rfs
};
