"use strict";

var cp    = require("child_process");
var fs    = require("fs");
var tmp   = require("tmp");
var utils = require("./utils");

function compress(callback, tmp) {
	var self = this;

	this.findName({}, false, function(err, name) {
		if(err)
			return callback(name, err);

		self.touch(name, function(err) {
			if(err)
				return callback(name, err);

			if(typeof self.options.compress == "function")
				self.external(tmp, name, callback.bind(null, name));
			else
				throw new Error("Not implemented yet");
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

	var name = tmp ? this.name + "." + count + ".log": this.generator(this.options.interval ? new Date(this.prev) : this.rotation, count + 1);
	var self = this;

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

function touch(name, callback, retry) {
	var self = this;

	fs.open(name, "a", function(err, fd) {
		if(err && err.code != "ENOENT" && ! retry)
			return callback(err);

		if(! err)
			return callback();

		utils.makePath(name, err, function(err) {
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
	touch:    touch
};
