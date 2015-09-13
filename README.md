# rotating-file-stream

[![Build Status](https://travis-ci.org/iccicci/rotating-file-stream.png)](https://travis-ci.org/iccicci/rotating-file-stream)
[![Code Climate](https://codeclimate.com/github/iccicci/rotating-file-stream/badges/gpa.svg)](https://codeclimate.com/github/iccicci/rotating-file-stream)
[![Test Coverage](https://codeclimate.com/github/iccicci/rotating-file-stream/badges/coverage.svg)](https://codeclimate.com/github/iccicci/rotating-file-stream/coverage)
[![Donate](http://img.shields.io/bitcoin/donate.png?color=red)](https://www.coinbase.com/cicci)

[![dependency status](https://david-dm.org/iccicci/rotating-file-stream.svg)](https://david-dm.org/iccicci/rotating-file-stream#info=dependencies)
[![dev dependency status](https://david-dm.org/iccicci/rotating-file-stream/dev-status.svg)](https://david-dm.org/iccicci/rotating-file-stream#info=devDependencies)

[![NPM](https://nodei.co/npm/rotating-file-stream.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/rotating-file-stream/)

### Usage

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs('file.log', {
    size:     '10M', // rotate every 10 MegaBytes written
    interval: '1d',  // rotate daily
    compress: 'gzip' // compress rotated files 
});

stream.on('error', function(err) {
    // here are reported errors occurred while rotating as well write errors
});

stream.on('rotation', function() {
    // rotation job started
});

stream.on('rotated', function(filename) {
    // rotation job completed with success and produced given filename
});
```

# under development

__This package is currently under development.__

Please check the [TODO list](https://github.com/iccicci/rotating-file-stream#todo) to be aware of what is missing.

### Installation

With [npm](https://www.npmjs.com/package/rotating-file-stream):
```sh
npm install rotating-file-stream
```

# API

## rfs(filename, options)

Returns a new [stream.Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable) to _filename_ as
[fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options) does.
The file is rotated following _options_ rules.

### options

* compress: {String} (default: null) Specifies compression method of rotated files.
* interval: {String} (default: null) Specifies the time interval to rotate the file.
* size: {String} (default: null) Specifies the file size to rotate the file.
* highWaterMark: {Number} (default: 16K) Proxied to [new stream.Writable](https://nodejs.org/api/stream.html#stream_new_stream_writable_options)
* mode: {Integer} (default: 0o666) Proxied to [fs.open](https://nodejs.org/api/fs.html#fs_fs_open_path_flags_mode_callback)

#### size

Accepts a positive integer followed by one of these possible letters:

* __K__: KiloBites
* __M__: MegaBytes
* __G__: GigaBytes

```javascript
  size: '300K', // rotates the file when its size exceeds 300 KiloBytes
```

```javascript
  size: '100M', // rotates the file when its size exceeds 100 MegaBytes
```

```javascript
  size: '1G', // rotates the file when its size exceeds a GigaBytes
```

#### interval

Accepts a positive integer followed by one of these possible letters:

* __m__: minutes. Accepts integer divider of 60.
* __h__: hours. Accepts integer divider of 24.
* __d__: days

```javascript
  interval: '5m', // rotates the file at minutes 0, 5, 10, 15 and so on
```

```javascript
  interval: '2h', // rotates the file at midnight, 02:00, 04:00 and so on
```

```javascript
  interval: '1d', // rotates the file at every midnight
```

### Under the hood

### Licence

[MIT Licence](https://github.com/iccicci/rotating-file-stream/blob/master/LICENSE)

### Bugs

Do not hesitate to report any bug or inconsistency @[github](https://github.com/iccicci/rotating-file-stream/issues).

### TODO

* Complete README
* Write tests
* Write code
* Emit events
* External compression
* Internal compression gzip
* Internal compression bzip
* Internal compression zip

### Changelog

* 2015-09-10 - v0.0.0
  * Embryonal stage
