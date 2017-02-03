"use strict";

function _clear(done) {
	if(this.timer) {
		clearTimeout(this.timer);
		this.timer = null;
	}
}

function _interval(now) {
	    now   = new Date(now);
	var year  = now.getFullYear();
	var month = now.getMonth();
	var day   = now.getDate();
	var hours = now.getHours();
	var num   = this.options.interval.num;
	var unit  = this.options.interval.unit;

	if(unit === "d")
		hours = 0;
	else
		hours = parseInt(hours / num, 10) * num;

	this.prev = new Date(year, month, day, hours, 0, 0, 0).getTime();

	if(unit === "d")
		this.next = new Date(year, month, day + num, hours, 0, 0, 0).getTime();
	else
		this.next = new Date(year, month, day, hours + num, 0, 0, 0).getTime();
}

function interval() {
	if(! this.options.interval)
		return;

	var now  = this.now();
	var unit = this.options.interval.unit;

	if(unit === "d" || unit === "h") {
		this._interval(now);
	}
	else {
		var period = 1000 * this.options.interval.num;

		if(unit === "m")
			period *= 60;

		this.prev = parseInt(now / period, 10) * period;
		this.next = this.prev + period;
	}

	this.timer = setTimeout(this.rotate.bind(this), this.next - now);
	this.timer.unref();
}

module.exports = {
	_clear:    _clear,
	_interval: _interval,
	interval:  interval,
};
