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
```

### Installation

With [npm](https://www.npmjs.com/package/rotating-file-stream):
```sh
npm install rotating-file-stream
```

# API

```javascript
require('rotating-file-stream');
```
Returns __RotatingFileStream__ constructor.

## Class: RotatingFileStream
Extends [stream.Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable).

## [new] RotatingFileStream(filename, options)

Returns a new __RotatingFileStream__ to _filename_ as
[fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options) does.
The file is rotated following _options_ rules.

### filename {String|Function}

The most complex problem about file name is: "how to call the rotated file name?"

The answer to this question may vary in many forms depending on application requirements and/or specifications.
If there are no requirements, a _String_ can be used and _default rotated file name generator_ will be used;
otherwise a _Function_ which returns the _rotated file name_ can be used.

#### function filename(time, index)

* time: {Date} If rotation by interval is enabled, the start time of rotation period, otherwise the time when rotation job started. If __null__, the _not-rotated file name_ must be returned.
* index {Number} The progressive index of rotation by size in the same rotation period.

An example of a complex _rotated file name generator_ function could be:

```javascript
function pad(num) {
    return (num > 9 ? "" : "0") + num;
}

function generator(time, index) {
    if(! time)
        return "file.log";

    var month  = time.getFullYear() + "" + pad(time.getMonth() + 1);
    var day    = pad(time.getDate());
    var hour   = pad(time.getHours());
    var minute = pad(time.getMinutes());

    return "/storage/" + month + "/" +
        month + day + "-" + hour + minute + "-" + index + "-" + filename;
}

var rfs    = require('rotating-file-stream');
var stream = rfs(generator, {
    size:     '10M',
    interval: '1d'
});
```

__Note:__
If part of returned destination path does not exists, the rotation job will try to create it.

### options {Object}

* compress: {String|Function|True} (default: null) Specifies compression method of rotated files.
* interval: {String} (default: null) Specifies the time interval to rotate the file.
* path: {String} (default: null) Specifies the base path for files.
* size: {String} (default: null) Specifies the file size to rotate the file.
* highWaterMark: {Number} (default: 16K) Proxied to [new stream.Writable](https://nodejs.org/api/stream.html#stream_new_stream_writable_options)
* mode: {Integer} (default: 0o666) Proxied to [fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options)

#### path

If present, it is prepended to generated file names.

#### size

Accepts a positive integer followed by one of these possible letters:

* __B__: Bites
* __K__: KiloBites
* __M__: MegaBytes
* __G__: GigaBytes

```javascript
  size: '300B', // rotates the file when its size exceeds 300 Bytes
                // useful for tests
```

```javascript
  size: '300K', // rotates the file when its size exceeds 300 KiloBytes
```

```javascript
  size: '100M', // rotates the file when its size exceeds 100 MegaBytes
```

```javascript
  size: '1G', // rotates the file when its size exceeds a GigaByte
```

#### interval

Accepts a positive integer followed by one of these possible letters:

* __s__: seconds. Accepts integer divider of 60.
* __m__: minutes. Accepts integer divider of 60.
* __h__: hours. Accepts integer divider of 24.
* __d__: days

```javascript
  interval: '5s', // rotates the file at seconds 0, 5, 10, 15 and so on
                  // useful for tests
```

```javascript
  interval: '5m', // rotates the file at minutes 0, 5, 10, 15 and so on
```

```javascript
  interval: '2h', // rotates the file at midnight, 02:00, 04:00 and so on
```

```javascript
  interval: '1d', // rotates the file at every midnight
```

#### compress

Due the nature of __Node.js__ compression may be done with an external command (to use other CPUs than the one used
by __Node.js__) or with internal code (to use the CPU used by __Node.js__). This decision is left to you.

Following fixed strings are allowed to compress the files with internal libraries:
* bzip2 (__not implemented yet__)
* gzip

To enable external compression, a _function_ can be used or simply the _boolean_ __true__ value to use default
external compression.
The function should accept _source_ and _dest_ file names and must return the shell command to be executed to
compress the file.
The two following code snippets have exactly the same effect:

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs('file.log', {
    size:     '10M',
    compress: true
});
```

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs('file.log', {
    size:     '10M',
    compress: function(source, dest) {
        return "cat " + source + " | gzip -c9 > " + dest;
    }
});
```

__Note:__
The shell command to compress the rotated file should not remove the source file, it will be removed by the package
if rotation job complete with success.

### Events

Custom _Events_ are emitted by the stream.

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs(...);

stream.on('error', function(err) {
    // here are reported blocking errors
    // once this event is fired, the stream will be closed as well
});

stream.on('open', function() {
    // no rotated file is open (fired after each rotation as well)
});

stream.on('rotation', function() {
    // rotation job started
});

stream.on('rotated', function(filename) {
    // rotation job completed with success and produced given filename
});

stream.on('warning', function(err) {
    // here are reported non blocking errors
});
```

### Rotation logic

Regardless of when and why rotation happens, the content of a single
[stream.write](https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback)
will never be split among two files.

#### by size

Once the _not-rotated_ file is opened first time, its size is checked and if it is greater or equal to
size limit, a first rotation happens. After each
[stream.write](https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback),
the same check is performed.

#### by interval

The package sets a _Timeout_ to start a rotation job at the right moment.

### Under the hood

Logs should be handled so carefully, so this package tries to never overwrite files.

At stream creation, if the _not-rotated_ log file already exists and its size exceeds the rotation size,
an initial rotation attempt is done.

At each rotation attempt a check is done to verify that destination rotated file does not exists yet;
if this is not the case a new destination _rotated file name_ is generated and the same check is
performed before going on. This is repeated until a not existing destination file name is found or the
package is exhausted. For this reason the _rotated file name generator_ function may be called several
times for each rotation job.

Once an __error__ _event_ is emitted, nothing more can be done: the stream is closed as well.

### Compatibility

This package is written following  __Node.js 4.0__ specifications always taking care about backward
compatibility. The package it tested under following versions:
* 4.1
* 4.0
* 0.12
* 0.11

__Required: Node.js 0.11__

### Licence

[MIT Licence](https://github.com/iccicci/rotating-file-stream/blob/master/LICENSE)

### Bugs

Do not hesitate to report any bug or inconsistency @[github](https://github.com/iccicci/rotating-file-stream/issues).

### ChangeLog

* 2015-10-?? - v1.0.2
  * README update
* 2015-10-08 - v1.0.1
  * README fix
* 2015-10-08 - v1.0.0
  * Async error reporting refactory
* 2015-10-07 - v0.1.0
  * Internal gzip compression
* 2015-10-06 - v0.0.5
  * External compression
* 2015-09-30 - v0.0.4
  * Added _path_ option
  * Missing path creation
* 2015-09-29 - v0.0.3
  * Rotation by interval
  * __Buffer__ optimization (thanks to [allevo](https://www.npmjs.com/~allevo))
* 2015-09-17 - v0.0.2
  * Rotation by size
* 2015-09-14 - v0.0.1
  * README.md
* 2015-09-10 - v0.0.0
  * Embryonal stage
