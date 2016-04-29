"use strict";

var cp    = require("child_process");
var fs    = require("fs");
var tmp   = require("tmp");
var utils = require("./utils");
var zlib  = require("zlib");

function compress(tmp) {
	var self = this;

	this.findName({}, false, function(err, name) {
		if(err)
			return self.emit("error", err);

		self.touch(name, function(err) {
			if(err)
				return self.emit("error", err);

			var done = function(err) {
				if(err)
					return self.emit("error", err);

				fs.unlink(tmp, function(err) {
					if(err)
						self.emit("warning", err);

					self.emit("rotated", name);
					self.interval();
				});
			};

			if(typeof self.options.compress == "function")
				self.external(tmp, name, done);
			else
				self.gzip(tmp, name, done);
				/*
				if(self.options.compress == "gzip")
					self.gzip(tmp, name, done);
				else
					throw new Error("Not implemented yet");
				*/
		});
	});
}

function external(src, dst, callback) {
	var self = this;

	tmp.file({ mode: parseInt("777", 8) }, function(err, path, fd, done) {
		if(err)
			return callback(err);

		var cb = function(err) {
			done();
			callback(err);
		};

		fs.write(fd, self.options.compress(src, dst), function(err) {
			if(err)
				return cb(err);

			fs.close(fd, function(err) {
				if(err)
					return cb(err);

				cp.exec(path, cb);
			});
		});
	});
}

function findName(attempts, tmp, callback) {
	var count = 0;

	for(var i in attempts)
		count += attempts[i];

	if(count >= 1000) {
		var err = new Error("Too many destination file attempts");

		err.attempts = attempts;
		err.code     = "RFS-TOO-MANY";

		return callback(err);
	}

	var name = this.name + "." + count + ".log";
	var self = this;

	if(! tmp)
		try {
			name = this.generator(this.options.interval ? new Date(this.prev) : this.rotation, count + 1);
		}
		catch(err) {
			return process.nextTick(callback.bind(null, err));
		}

	fs.stat(name, function(err) {
		if((! err) || err.code != "ENOENT" ) {
			if(name in attempts)
				attempts[name]++;
			else
				attempts[name] = 1;

			return self.findName(attempts, tmp, callback);
		}

		callback(null, name);
	});
}

function gzip(src, dst, callback) {
	var inp   = fs.createReadStream(src);
	var out   = fs.createWriteStream(dst);
	var zip   = zlib.createGzip();
	var files = [inp, out, zip];

	for(var i in files)
		files[i].once("error", callback);

	out.once("finish", callback);

	inp.pipe(zip).pipe(out);
}

function touch(name, callback, retry) {
	var self = this;

	fs.open(name, "a", function(err, fd) {
		if(err && err.code != "ENOENT" && ! retry)
			return callback(err);

		if(! err)
			return callback();

		utils.makePath(name, function(err) {
			if(err)
				return callback(err);

			self.touch(name, callback, true);
		});
	});
}

module.exports = {
	compress: compress,
	external: external,
	findName: findName,
	gzip:     gzip,
	touch:    touch
};
