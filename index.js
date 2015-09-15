"use strict";

var fs = require("fs");
var util = require("util");
var Writable = require("stream").Writable;

function checkMeasure(v, what, units) {
	var ret = {};

	ret.num = parseInt(v);

	if(isNaN(ret.num))
		throw new Error("Unknown 'options." + what + "' format: " + v);

	if(ret.num <= 0)
		throw new Error("A positive integer number is expected for 'options." + what + "'");

	ret.unit = v.replace(/^[ 0]*/g, "").substr((ret.num + "").length, 1);

	if(ret.unit.length === 0)
		throw new Error("Missing unit for 'options." + what + "'");

	if(! units[ret.unit])
		throw new Error("Unknown 'options." + what + "' unit: " + ret.unit);

	return ret;
}

var intervalUnits = {
	m: true,
	h: true,
	d: true
};

function checkInterval(v) {
	var ret = checkMeasure(v, "interval", intervalUnits);

	switch(ret.unit) {
	case "m":
		if(parseInt(60 / ret.num) * ret.num != 60)
			throw new Error("An integer divider of 60 is expected as minutes for 'options.interval'");
		break;

	case "h":
		if(parseInt(24 / ret.num) * ret.num != 24)
			throw new Error("An integer divider of 24 is expected as hours for 'options.interval'");
		break;
	}

	return ret;
}

var sizeUnits = {
	K: true,
	M: true,
	G: true
};

function checkSize(v) {
	var ret = checkMeasure(v, "size", sizeUnits);

	if(ret.unit == "K")
		return ret.num * 1024;

	if(ret.unit == "M")
		return ret.num * 1048576;

	return ret.num * 1073741824;
}

function checkOptions(options) {
	for(var opt in options) {
		var val = options[opt];
		var typ = typeof val;

		switch(opt) {
		case "compress":
			if(! val)
				throw new Error("A value for 'options.compress' must be specified");

			if(typ == "boolean")
				options.compress = function(src, dst) { return "cat " + src + " | gzip -t9 > " + dst; };
			else
				if(typ == "string") {
					if(val != "bzip" && val != "gzip" && val != "zip")
						throw new Error("Don't know how to handle compression method: " + val);
				}
				else
					if(typ != "function")
						throw new Error("Don't know how to handle 'options.compress' type: " + typ);
			break;

		case "highWaterMark":
			break;

		case "interval":
			if(typ != "string")
				throw new Error("Don't know how to handle 'options.interval' type: " + typ);

			options.interval = checkInterval(val);
			break;

		case "mode":
			break;

		case "size":
			if(typ != "string")
				throw new Error("Don't know how to handle 'options.size' type: " + typ);

			options.size = checkSize(val);
			break;

		default:
			throw new Error("Unknown option: " + opt);
		}
	}
}

function pad(num) {
    return (num + "").length == 1 ? "0" + num : num;
}

function createGenerator(filename) {
	return function(time, index) {
		if(! time)
			return filename;

		var month  = time.getFullYear() + "" + pad(time.getMonth() + 1);
		var day    = pad(time.getDate());
		var hour   = pad(time.getHours());
		var minute = pad(time.getMinutes());

		return month + day + "-" + hour + minute + "-" + pad(index) + "-" + filename;
	};
}

function RotatingFileStream(filename, options) {
	if(! (this instanceof RotatingFileStream))
		return new RotatingFileStream(filename, options);

	var generator;
	var opt = {};

	if(typeof filename == "function")
		generator = filename;
	else
		if(typeof filename == "string")
			generator = createGenerator(filename);
		else
			throw new Error("Don't know how to handle 'filename' type: " + typeof filename);

	if(! options)
		options = {};
	else
		if(typeof options != "object")
			throw new Error("Don't know how to handle 'options' type: " + typeof options);

	checkOptions(options);

	if(options.highWaterMark)
		opt.highWaterMark = options.highWaterMark;

	Writable.call(this);

	this.generator = generator;
	this.options   = options;
	this.size      = 0;

	this.firstOpen();
}

util.inherits(RotatingFileStream, Writable);

RotatingFileStream.prototype._write = function(chunk, encoding, callback) {
	this._size += chunk.length;
	this.stream.write(chunk, callback);
};

RotatingFileStream.prototype._writev = function(chunks, callback) {
	var buffer = "";

	for(var i in chunks)
		buffer += chunks[i].chunk;

	this._size += buffer.length;
	this.stream.write(buffer, callback);
};

RotatingFileStream.prototype.firstOpen = function() {
	try {
		this.name = this.generator(null);
	}
	catch(e) {
		var err = new Error("Executing file name generator first time: " + e.message);

		err.source = e;

		throw err;
	}

	if(this.firstRotation())
		this.open();
};

RotatingFileStream.prototype.firstRotation = function() {
	var stats;

	try {
		stats = fs.statSync(this.name);
	}
	catch(e) {
		if(e.code == "ENOENT")
			return true;

		throw e;
	}

	if(! stats.isFile())
		throw new Error("Can't write on: " + this.name + " (it is not a file)");

	this.size = stats.size;

	if((! this.options.size) || stats.size < this.options.size)
		return true;

	this.rotate();

	return false;
};

RotatingFileStream.prototype.open = function() {
	var fd;

	try {
		var options = { flags: "a" };

		if("mode" in this.options)
			options.mode = this.options.mode;

		this.stream = fs.createWriteStream(this.name, options);
	}
	catch(e) {
		console.log(e);
		throw e;
	}

	this.stream.once("open", function(fd) {
	});
};

RotatingFileStream.prototype.rotate = function() {
	this.emit("rotation");
};

module.exports = RotatingFileStream;
