"use strict";

var fs = require("fs");

var RotatingFileStream = require("./constructor");

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
