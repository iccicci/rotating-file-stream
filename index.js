"use strict";

var fs = require("fs");

var RotatingFileStream = require("./constructor");

function unexpected(msg) {
	throw new Error("Unexpected case ( https://www.npmjs.com/package/rotating-file-stream#unexpected ): " + msg);
}

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

RotatingFileStream.prototype._write = function(chunk, encoding, callback) {
	if(this.err)
		unexpected("_write after error");

	if(this.callback && this.callback != this._callback)
		unexpected("_write before callback");

	if(! this.stream) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		this.callback = callback;

		return;
	}

	var self = this;

	this.size += chunk.length;
	this.stream.write(chunk, function(err) {
		if(err)
			return callback(err);

		if(self.options.size && self.size >= self.options.size)
			return self.rotate(callback);

		callback();
	});
};

RotatingFileStream.prototype._writev = function(chunks, callback) {
	if(this.err)
		unexpected("_writev after error");

	if(this.callback && this.callback != this._callback)
		unexpected("_writev before callback");

	if(! this.stream)
		unexpected("_writev while initial rotation");

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
			return self.error(err, callback);

		if(!remainingBuffer.length)
			return callback();

		self.buffer = remainingBuffer;

		self.rotate(callback);
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

RotatingFileStream.prototype.move = function(attempts) {
	if(! attempts)
		attempts = {};

	var count = 0;

	for(var i in attempts)
		count += attempts[i];

	if(count >= 1000) {
		var err = new Error("Too many destination file attempts");

		err.attempts = attempts;

		return this.callback(err);
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

			return self.move(attempts);
		}

		if(self.options.compress)
			throw new Error("not implemented yet");

		fs.rename(self.name, name, function(err) {
			if(err)
				return self.error(err, this.callback);

			self.emit("rotated", name);
			self.open();
		});
	});
};

RotatingFileStream.prototype.open = function() {
	var fd;
	var self = this;

	var callback = function(err) {
		var cb = self.callback;

		if(cb) {
			self.callback = null;

			return cb(err);
		}

		if(err)
			throw err;
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

	this.size += this.buffer.length;
	this.buffer = new Buffer(0);
};

RotatingFileStream.prototype.rotate = function(callback) {
	if(callback)
		this.callback = callback;

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
