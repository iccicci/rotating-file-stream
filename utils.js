"use strict";

var fs   = require("fs");
var path = require("path");

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

var checks = {
	"compress": function(typ, options, val) {
		if(! val)
			throw new Error("A value for 'options.compress' must be specified");

		if(typ == "boolean")
			options.compress = function(src, dst) { return "cat " + src + " | gzip -c9 > " + dst; };
		else
			if(typ == "string") {
				//if(val != "bzip" && val != "gzip")
				if(val != "gzip")
					throw new Error("Don't know how to handle compression method: " + val);
			}
			else
				if(typ != "function")
					throw new Error("Don't know how to handle 'options.compress' type: " + typ);
	},

	"highWaterMark": function() {},

	"interval": function(typ, options, val) {
		if(typ != "string")
			throw new Error("Don't know how to handle 'options.interval' type: " + typ);

		options.interval = checkInterval(val);
	},

	"mode": function() {},

	"path": function(typ) {
		if(typ != "string")
			throw new Error("Don't know how to handle 'options.path' type: " + typ);
	},

	"size": function(typ, options, val) {
		if(typ != "string")
			throw new Error("Don't know how to handle 'options.size' type: " + typ);

		options.size = checkSize(val);
	}
};

function checkOptions(options) {
	for(var opt in options) {
		var val = options[opt];
		var typ = typeof val;

		if(! (opt in checks))
			throw new Error("Unknown option: " + opt);

		checks[opt](typ, options, val);
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

function makePath(name, err, callback) {
	var dir = path.parse(name).dir;

	fs.mkdir(dir, function(e) {
		if(e) {
			if(e.code == "ENOENT")
				return makePath(dir, err, callback);

			return callback(e);
		}

		callback();
	});
}

function setEvents(self) {
	var finish = true;

	self.once("error", function(err) {
		self.err = err;
		self.end();

		if(self.stream)
			self.stream.end();

		process.nextTick(function() {
			if(finish)
				self.emit("finish");
		});
	});

	self.once("finish", function() {
		finish = false;

		if(self.timer)
			clearTimeout(self.timer);

		self.timer = null;
	});
}

module.exports = {
	checkOptions:    checkOptions,
	createGenerator: createGenerator,
	makePath:        makePath,
	setEvents:       setEvents,
};
