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
	d: true,
	h: true,
	m: true,
	s: true
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

	case "s":
		if(parseInt(60 / ret.num) * ret.num != 60)
			throw new Error("An integer divider of 60 is expected as seconds for 'options.interval'");
		break;
	}

	return ret;
}

var sizeUnits = {
	B: true,
	G: true,
	K: true,
	M: true
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
					if(val != "bzip" && val != "gzip")
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
	return (num > 9 ? "" : "0") + num;
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
	var opt  = {};
	var self = this;

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

	Writable.call(this, opt);

	this.buffer    = new Buffer(0);
	this.generator = generator;
	this.options   = options;
	this.size      = 0;

	this.once("error", function(err) {
		var finish = true;

		self.err = err;
		self.once("finish", function() { finish = false; });
		self.end();

		setTimeout(function() { if(finish) self.emit("finish"); }, 100);
	});

	this.once("finish", function() {
		self.closed = true;

		if(self.timer)
			clearTimeout(self.timer);

		self.timer = null;
	});

	this.firstOpen();
}

util.inherits(RotatingFileStream, Writable);

RotatingFileStream.prototype._callback = function(err) {
	if(err) {
		setTimeout(this.end.bind(this), 100);

		if(this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		if(! this.callback)
			this.emit("error", err);
	}

	if(! this.callback)
		return;

	if(err)
		process.nextTick(this.callback.bind(null, err));
	else
		if(this.chunks)
			process.nextTick(this._rewrite.bind(this, this.chunks, this.index, this.callback));
		else
			process.nextTick(this.callback);

	this.callback = null;
	this.chunks   = null;
};

RotatingFileStream.prototype._rewrite = function(chunks, index, callback, err) {
	if(err)
		return callback(err);

	if(! this.stream) {
		this.callback = callback;
		this.chunks   = chunks;
		this.index    = index;

		return;
	}

	if(this.options.size && this.size >= this.options.size) {
		this.callback = callback;
		this.chunks   = chunks;
		this.index    = index;

		return this.rotate();
	}

	if(chunks.length == index)
		return callback();

	var buffer;
	var chunk;

	if(chunks.length - index == 1) {
		chunk      = chunks[index++].chunk;
		this.size += chunk.length;
		buffer     = chunk;
	}
	else {
		buffer = new Buffer(0);

		while(index < chunks.length && ((! this.options.size) || this.size < this.options.size)) {
			chunk      = chunks[index++].chunk;
			this.size += chunk.length;
			buffer     = Buffer.concat([buffer, chunk], buffer.length + chunk.length);
		}
	}

	this.stream.write(buffer, this._rewrite.bind(this, chunks, index, callback));
};

RotatingFileStream.prototype._write = function(chunk, encoding, callback) {
	if(this.err)
		return callback(this.err);

	this._rewrite([{ chunk: chunk }], 0, callback);
};

RotatingFileStream.prototype._writev = function(chunks, callback) {
	if(this.err)
		return callback(this.err);

	this._rewrite(chunks, 0, callback);
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

RotatingFileStream.prototype.interval = function() {
	if(! this.options.interval)
		return;

	if(this.closed)
		return;

	var period = 1000 * this.options.interval.num;

	switch(this.options.interval.unit) {
	case "d":
		period *= 24;
		/* falls through */
	case "h":
		period *= 60;
		/* falls through */
	case "m":
		period *= 60;
	}

	var now  = new Date().getTime();
	var prev = parseInt(now / period) * period;

	this.prev  = prev;
	this.timer = setTimeout(this.rotate.bind(this), prev + period - now);
	this.timer.unref();
};

RotatingFileStream.prototype.move = function(attempts) {
	if(! attempts)
		attempts = {};

	var count = 0;

	for(var i in attempts)
		count += attempts[i];

	if(count >= 1000) {
		var err = new Error("Too many destination file attempts");

		err.attempts = attempts;

		return this._callback(err);
	}

	var name = this.generator(this.options.interval ? new Date(this.prev) : this.rotation, count + 1);
	var self = this;

	fs.stat(name, function(err) {
		if((! err) || err.code != "ENOENT" ) {
			if(name in attempts)
				attempts[name]++;
			else
				attempts[name] = 1;

			return self.move(attempts);
		}

		if(self.options.compress)
			throw new Error("not implemented yet");

		fs.rename(self.name, name, function(err) {
			if(err)
				return self._callback(err);

			self.emit("rotated", name);
			self.open();
			self.size = 0;
		});
	});
};

RotatingFileStream.prototype.open = function() {
	var fd;
	var self = this;

	var callback = function(err) {
		self._callback(err);

		if(! err)
			self.interval();
	};

	try {
		var options = { flags: "a" };

		if("mode" in this.options)
			options.mode = this.options.mode;

		this.stream = fs.createWriteStream(this.name, options);
	}
	catch(e) {
		return callback(e);
	}

	callback();
};

RotatingFileStream.prototype.rotate = function() {
	if(this.timer) {
		clearTimeout(this.timer);
		this.timer = null;
	}

	this.size     = 0;
	this.rotation = new Date();
	process.nextTick(this.emit.bind(this, "rotation"));

	if(this.stream) {
		this.stream.on("finish", this.move.bind(this));
		this.stream.end();
		this.stream = null;
	}
	else
		this.move();
};

module.exports = RotatingFileStream;
