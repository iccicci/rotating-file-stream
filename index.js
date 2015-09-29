"use strict";

var fs       = require("fs");
var util     = require("util");
var utils    = require("./utils");
var Writable = require("stream").Writable;

function RotatingFileStream(filename, options) {
	if(! (this instanceof RotatingFileStream))
		return new RotatingFileStream(filename, options);

	if(typeof filename == "function")
		this.generator = filename;
	else
		if(typeof filename == "string")
			this.generator = utils.createGenerator(filename);
		else
			throw new Error("Don't know how to handle 'filename' type: " + typeof filename);

	if(! options)
		options = {};
	else
		if(typeof options != "object")
			throw new Error("Don't know how to handle 'options' type: " + typeof options);

	utils.checkOptions(options);
	Writable.call(this, options.highWaterMark ? { highWaterMark: options.highWaterMark } : {} );

	this.options = options;
	this.size    = 0;

	utils.setEvents(this);

	this.firstOpen();
}

util.inherits(RotatingFileStream, Writable);

RotatingFileStream.prototype._callback = function(err) {
	if(err) {
		if(this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		if(! this.callback)
			process.nextTick(this.emit.bind(this, "error", err));
	}

	if(! this.callback)
		return;

	if(err)
		process.nextTick(this.callback.bind(null, err));
	else
		process.nextTick(this._rewrite.bind(this, this.chunks, this.index, this.callback));

	this.callback = null;
	this.chunks   = null;
};

RotatingFileStream.prototype._postrewrite = function(chunks, index, callback, next) {
	this.callback = callback;
	this.chunks   = chunks;
	this.index    = index;

	if(next)
		next();
};

RotatingFileStream.prototype._rewrite = function(chunks, index, callback, err) {
	if(err)
		return callback(err);

	if(! this.stream)
		return this._postrewrite(chunks, index, callback);

	if(this.options.size && this.size >= this.options.size)
		return this._postrewrite(chunks, index, callback, this.rotate.bind(this));

	if(chunks.length == index)
		return callback();

	var buffer = new Buffer(0);
	var chunk;

	if(index + 1 == chunks.length) {
		chunk      = chunks[index++].chunk;
		this.size += chunk.length;
		buffer     = chunk;
	}
	else
		while(index < chunks.length && ((! this.options.size) || this.size < this.options.size)) {
			chunk      = chunks[index++].chunk;
			this.size += chunk.length;
			buffer     = Buffer.concat([buffer, chunk], buffer.length + chunk.length);
		}

	this.stream.write(buffer, this._rewrite.bind(this, chunks, index, callback));
};

RotatingFileStream.prototype._write = function(chunk, encoding, callback) {
	this._rewrite([{ chunk: chunk }], 0, callback);
};

RotatingFileStream.prototype._writev = function(chunks, callback) {
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

RotatingFileStream.prototype._interval = function(now) {
	    now   = new Date(now);
	var year  = now.getFullYear();
	var month = now.getMonth();
	var day   = now.getDate();
	var hours = now.getHours();
	var num   = this.options.interval.num;
	var unit  = this.options.interval.unit;

	if(unit == "d")
		hours = 0;
	else
		hours = parseInt(hours / num) * num;

	this.prev = new Date(year, month, day, hours, 0, 0, 0).getTime();

	if(unit == "d")
		this.next = new Date(year, month, day + num, hours, 0, 0, 0).getTime();
	else
		this.next = new Date(year, month, day, hours + num, 0, 0, 0).getTime();
};

RotatingFileStream.prototype.interval = function() {
	if(! this.options.interval)
		return;

	var now  = new Date().getTime();
	var unit = this.options.interval.unit;

	if(unit == "d" || unit == "h") {
		this._interval(now);
	}
	else {
		var period = 1000 * this.options.interval.num;

		if(unit == "m")
			period *= 60;

		this.prev = parseInt(now / period) * period;
		this.next = this.prev + period;
	}

	this.timer = setTimeout(this.rotate.bind(this), this.next - now);
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
