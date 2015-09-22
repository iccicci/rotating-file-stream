"use strict";

var fs = require("fs");

var RotatingFileStream = require("./constructor");

if (!Buffer.prototype.indexOf) {
	Buffer.prototype.indexOf = function(value, startAt) {
		if (value.length > 1) { throw new Error("Not yet supported"); }
		value = value instanceof Buffer ? value : new Buffer(value);

		startAt = startAt || 0;
		for(var i = startAt; i < this.length; i++) {
				if (this[i] === value[0]) { return i; }
		}
	};
}

RotatingFileStream.prototype._callback = function(err) {
	if(err) {
		setTimeout(this.end.bind(this), 100);

		if(this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	if(this.callback) {
		var callback = this.callback;

		this.callback = null;

		return callback(err);
	}

	if(err)
		this.emit("error", err);
};

RotatingFileStream.prototype._rotate = function() {
	if(! this.callback)
		return this.rotate();

	var prev = this.callback;
	var self = this;

	this.callback = function(err) {
		if(err)
			return prev(err);

		self.callback = prev;
		self.rotate();
	};
};

RotatingFileStream.prototype._write = function(chunk, encoding, callback) {
	if(this.err)
		return callback(this.err);

	this.callback = callback;

	if(! this.stream)
		return (this.buffer = chunk);

	var self = this;

	this.size += chunk.length;
	this.stream.write(chunk, function(err) {
		if(err)
			return self._callback(err);

		if(self.options.size && self.size >= self.options.size)
			return self.rotate();

		self._callback();
	});
};

RotatingFileStream.prototype._writev = function(chunks, callback) {
	if(this.err)
		return callback(this.err);

	this.callback = callback;

	var buffer = Buffer.concat(chunks.map(function(chunk) { return chunk.chunk; }));
	var remainingBuffer = new Buffer(0);
	var remainingBytes = this.options.size - this.size;
	if (this.options.size && remainingBytes < buffer.length) {
		var index = buffer.indexOf("\n", remainingBytes - 1) + 1;
		remainingBuffer = buffer.slice(index);
		buffer = buffer.slice(0, index);
		// if (remainingBuffer.length > this.options.size) problems: split remaing into small chunks
	}

	var self = this;
	this.size += buffer.length;
	this.stream.write(buffer, function(err) {
		if(err)
			return self._callback(err);

		if(!remainingBuffer.length)
			return self._callback();

		self.buffer = remainingBuffer;

		self.rotate();
	});
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
	this.timer = setTimeout(this._rotate.bind(this), prev + period - now);
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

	if(! this.buffer.length)
		return callback();

	this.stream.write(this.buffer, function(err) {
		if(err)
			return self.error(err, callback);

		callback();
	});

	this.size   = this.buffer.length;
	this.buffer = new Buffer(0);
};

RotatingFileStream.prototype.rotate = function() {
	if(this.timer) {
		clearTimeout(this.timer);
		this.timer = null;
	}

	this.size     = 0;
	this.rotation = new Date();
	this.emit("rotation");

	if(this.stream) {
		this.stream.on("finish", this.move.bind(this));
		this.stream.end();
		this.stream = null;
	}
	else
		this.move();
};

module.exports = RotatingFileStream;
