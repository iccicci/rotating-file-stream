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
	B: true,
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

	if(ret.unit == "G")
		return ret.num * 1073741824;

	return ret.num;
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

	this.buffer    = "";
	this.generator = generator;
	this.options   = options;
	this.size      = 0;

	this.firstOpen();
}

util.inherits(RotatingFileStream, Writable);

RotatingFileStream.prototype._write = function(chunk, encoding, callback) {
	if(this.err)
		return process.nextTick(callback.bind(null, this.err));

	if(! this.stream) {
		if(this.callback)
			throw new Error("Multi double callback");

		this.buffer += chunk;
		this.callback = callback;

		return;
	}

	var self = this;

	this.size += chunk.length;
	this.stream.write(chunk, function(err) {
		if(err)
			return self.error(err, callback.bind(null, err));

		if(self.options.size && self.size >= self.options.size)
			return self.rotate(callback);

		callback();
	});
};

RotatingFileStream.prototype._writev = function(chunks, callback) {
	if(this.err)
		return process.nextTick(callback);

	var i;

	if(! this.stream) {
		if(this.callback)
			throw new Error("Multi double callback");

		for(i in chunks)
			this.buffer += chunks[i].chunk;

		this.callback = callback;

		return;
	}

	var buffer = "";
	var enough = true;
	var self = this;

	for(i = 0; i < chunks.length && enough; ++i) {
		buffer += chunks[i].chunk;

		if(this.options.size && (buffer.length + this.size >= this.options.size))
			enough = false;
	}

	this.size += buffer.length;
	this.stream.write(buffer, function(err) {
		if(err)
			return self.error(err, callback);

		if(enough)
			return callback();

		for(0; i < chunks.length; ++i)
			self.buffer += chunks[i].chunk;

		self.rotate(callback);
	});
};

RotatingFileStream.prototype.error = function(err, callback) {
	this.err = err;
	this.emit("error", err);

	if(callback)
		callback(err);
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

	process.nextTick(this.rotate.bind(this));

	return false;
};

RotatingFileStream.prototype.move = function(callback, attempts) {
	if(! attempts)
		attempts = {};

	var count = 0;

	for(var i in attempts)
		count += attempts[i];

	if(count >= 1000) {
		this.error(new Error("Too many destination file attempts"), callback);
		this.err.attempts = attempts;

		return;
	}

	if(this.options.interval)
		throw new Error("not implemented yet");

	var name = this.generator(this.rotation, count + 1);
	var self = this;

	fs.stat(name, function(err) {
		if((! err) || err.code != "ENOENT" ) {
			if(name in attempts)
				attempts[name]++;
			else
				attempts[name] = 1;

			return self.move(callback, attempts);
		}

		if(self.options.compress)
			throw new Error("not implemented yet");

		fs.rename(self.name, name, function(err) {
			if(err)
				return self.error(err, callback);

			self.emit("rotated", name);
			self.open(callback);
		});
	});
};

RotatingFileStream.prototype.open = function(callback) {
	var fd;

	if(this.callback) {
		if(callback) {
			var cb1 = this.callback;
			var cb2 = callback;

			callback = function(err) {
				cb1(err);
				cb2(err);
			};
		}
		else
			callback = this.callback;

		this.callback = null;
	}

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

	if(! this.buffer.length) {
		if(callback)
			callback();

		return;
	}

	var self = this;

	this.stream.write(this.buffer, function(err) {
		if(err)
			return self.error(err, callback);

		if(callback)
			callback();
	});

	this.size += this.buffer.length;
	this.buffer = "";
};

RotatingFileStream.prototype.rotate = function(callback) {
	this.size = 0;
	this.rotation = new Date();
	this.emit("rotation");

	if(this.stream) {
		this.stream.on("finish", this.move.bind(this, callback));
		this.stream.end();
		this.stream = null;
	}
	else
		this.move(callback);
};

module.exports = RotatingFileStream;
