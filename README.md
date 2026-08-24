# rotating-file-stream

[![Build Status][gha-badge]][gha-url]
[![codecov][codecov-badge]][codecov-url]
[![NPM version][npm-badge]][npm-url]

[![NPM downloads][npm-downloads-badge]][npm-url]
[![Dependents][deps-badge]][npm-url]
[![Stars][stars-badge]][stars-url]

[![Types][types-badge]][npm-url]
[![Donate][donate-badge]][donate-url]

[codecov-badge]: https://codecov.io/gh/iccicci/rotating-file-stream/graph/badge.svg
[codecov-url]: https://codecov.io/gh/iccicci/rotating-file-stream
[deps-badge]: https://img.shields.io/librariesio/dependents/npm/rotating-file-stream?logo=npm
[deps-url]: https://www.npmjs.com/package/rotating-file-stream?activeTab=dependents
[donate-badge]: https://img.shields.io/static/v1?label=donate&message=bitcoin&color=blue&logo=bitcoin
[donate-url]: https://blockchain.info/address/12p1p5q7sK75tPyuesZmssiMYr4TKzpSCN
[gha-badge]: https://github.com/iccicci/rotating-file-stream/actions/workflows/build.yml/badge.svg
[gha-url]: https://github.com/iccicci/rotating-file-stream/actions/workflows/build.yml
[github-url]: https://github.com/iccicci/rotating-file-stream
[npm-downloads-badge]: https://img.shields.io/npm/dw/rotating-file-stream?logo=npm
[npm-badge]: https://img.shields.io/npm/v/rotating-file-stream?color=green&logo=npm
[npm-url]: https://www.npmjs.com/package/rotating-file-stream
[stars-badge]: https://img.shields.io/github/stars/iccicci/rotating-file-stream?logo=github&style=flat&color=green
[stars-url]: https://github.com/iccicci/rotating-file-stream/stargazers
[types-badge]: https://img.shields.io/static/v1?label=types&message=included&color=green&logo=typescript

### Description

Creates a [stream.Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable) to a file which is
rotated. Rotation behavior can be deeply customized; optionally, classical UNIX **logrotate** behavior can be used.

### Usage

```javascript
import { createStream } from "rotating-file-stream";

const stream = createStream("file.log", {
  size: "10M", // rotate every 10 MegaBytes written
  interval: "1d", // rotate daily
  compress: "gzip" // compress rotated files
});
```

### Installation

With [npm](https://www.npmjs.com/package/rotating-file-stream):

```sh
$ npm install --save rotating-file-stream
```

### Table of contents

- [Upgrading from v3 to v4](#upgrading-from-v3-to-v4)
- [Upgrading from v2 to v3](#upgrading-from-v2-to-v3)
- [Upgrading from v1 to v2](#upgrading-from-v1-to-v2)
- [API](#api)
  - [createStream(filename[, options])](#createstreamfilename-options)
    - [filename](#filename)
      - [filename(args)](#filenameargs)
      - [filename(index)](#filenameindex)
  - [Class: RotatingFileStream](#class-rotatingfilestream)
    - [Event: 'external'](#event-external)
    - [Event: 'history'](#event-history)
    - [Event: 'open'](#event-open)
    - [Event: 'removed'](#event-removed)
    - [Event: 'rotation'](#event-rotation)
    - [Event: 'rotated'](#event-rotated)
    - [Event: 'warning'](#event-warning)
  - [options](#options)
    - [compress](#compress)
    - [encoding](#encoding)
    - [history](#history)
    - [immutable](#immutable)
    - [initialRotation](#initialrotation)
    - [interval](#interval)
    - [intervalBoundary](#intervalboundary)
    - [intervalUTC](#intervalutc)
    - [maxFiles](#maxfiles)
    - [maxSize](#maxsize)
    - [mode](#mode)
    - [omitExtension](#omitextension)
    - [path](#path)
    - [rotate](#rotate)
    - [size](#size)
    - [symLink](#symlink)
    - [teeToStdout](#teeToStdout)
- [Rotation logic](#rotation-logic)
- [Under the hood](#under-the-hood)
- [Compatibility](#compatibility)
- [TypeScript](#typescript)
- [License](#license)
- [Bugs](#bugs)
- [ChangeLog](#changelog)
- [Donating](#donating)

# Upgrading from v3 to v4

In **v4** the _file name generator_ TypeScript API was redesigned. Custom generators are also validated at runtime by
`createStream` (see below).

**Breaking change**: the standard generator no longer receives `(time, index?)`. It receives a single argument:

- `null`: return the _not-rotated file name_;
- `{ time: Date, index: number }`: return the _rotated file name_ (both fields are always present together).

**Breaking change**: the classical generator (when [`options.rotate`](#rotate) is used) no longer accepts an optional
index. It receives `number | null` (`null` for the _not-rotated file name_).

**Breaking change**: with TypeScript, `createStream` now picks the generator kind from options:

- if `options.rotate` is a `number`, `filename` must be `string | ClassicalGenerator`;
- otherwise `filename` must be `string | StandardGenerator`.

**Runtime check**: when `filename` is a function (not a string), `createStream` validates it before creating the stream.
A generator that still uses the v3 two-parameter signature, or that returns the same name for `null` and for distinct
rotation parameters, causes `createStream` to throw `RotatingFileStreamError`.

Exported types: `GeneratorArguments`, `StandardGenerator`, `ClassicalGenerator`, and `Generator`
(`ClassicalGenerator | StandardGenerator`).

### Errors

In **v4**, every error raised by the library (invalid options or generator passed to `createStream`, invariant
failures, unexpected thrown values, and similar) is a `RotatingFileStreamError`. Errors originating from Node.js
built-in APIs used at runtime (filesystem, streams, child processes, and the like) are propagated to the caller
unchanged: same type, message, and `code` where applicable.

### Migrating a standard generator

**v3:**

```javascript
const generator = (time, index) => {
  if (!time) return "file.log";
  return `${time.getFullYear()}-${index}-file.log`;
};

createStream(generator, { size: "10M" });
```

**v4:**

```javascript
const generator = args => {
  if (!args) return "file.log";
  return `${args.time.getFullYear()}-${args.index}-file.log`;
};

createStream(generator, { size: "10M" });
```

# Upgrading from v2 to v3

In **v3** the package was completely refactored using **async / await**.

**TypeScript** types for events and the [external](#event-external) event were added.

**Breaking change**: by default the `.gz` extension is added to the rotated compressed files.

**Breaking change**: the way the _external compression command_ is executed was slightly changed; possible breaking
change.

To maintain back compatibility upgrading from **v2** to **v3**, just follow this rules:

- using a _file name generator_ or not using [`options.compress`](#compress): nothing to do
- using a _file name_ and using [`options.compress`](#compress): use [`options.omitExtension`](#omitextension) or check
  how rotated files are treated.

# Upgrading from v1 to v2

There are two main changes in package interface.

In **v1** the _default export_ of the package was directly the **RotatingFileStream** _constructor_ and the caller
have to use it; while in **v2** there is no _default export_ and the caller should use the
[createStream](#rfscreatestreamfilename-options) exported function and should not directly use
[RotatingFileStream](#class-rotatingfilestream) class.
This is quite easy to discover: if this change is not applied, nothing than a runtime error can happen.

The other important change is the removal of option **rotationTime** and the introduction of **intervalBoundary**.
In **v1** the `time` argument passed to the _filename generator_ function, by default, is the time when _rotation job_
started, while if [`options.interval`](#interval) option is used, it is the lower boundary of the time interval within
_rotation job_ started. Later I was asked to add the possibility to restore the default value for this argument so I
introduced `options.rotationTime` option with this purpose. At the end the result was something a bit confusing,
something I never liked.
In **v2** the `time` argument passed to the _filename generator_ function is always the time when _rotation job_
started, unless [`options.intervalBoundary`](#intervalboundary) option is used. In a few words, to maintain back
compatibility upgrading from **v1** to **v2**, just follow this rules:

- using [`options.rotation`](#rotation): nothing to do
- not using [`options.rotation`](#rotation):
  - not using [`options.interval`](#interval): nothing to do
  - using [`options.interval`](#interval):
    - using `options.rotationTime`: to remove it
    - not using `options.rotationTime`: then use [`options.intervalBoundary`](#intervalboundary).

# API

```javascript
import { createStream } from "rotating-file-stream";
```

## createStream(filename[, options])

- `filename` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type) |
  [`<Function>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function) The name
  of the file or the function to generate it, called _file name generator_. See below for
  [details](#filename-stringfunction).
  With **TypeScript**, the accepted function type depends on options: `StandardGenerator` by default, or
  `ClassicalGenerator` when [`options.rotate`](#rotate) is set.
- `options` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)
  Rotation options, See below for [details](#options).
- Returns: [`<RotatingFileStream>`](#class-rotatingfilestream) The **rotating file stream**!

This interface is inspired to
[fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options) one. The file is rotated
following _options_ rules.

### filename

The most complex problem about file name is: _how to call the rotated file name?_

The answer to this question may vary in many forms depending on application requirements and/or specifications.
If there are no requirements, a `string` can be used and _default rotated file name generator_ will be used;
otherwise a `Function` which returns the _rotated file name_ can be used.

**Note:**
if part of returned destination path does not exists, the rotation job will try to create it.

#### filename(args)

Used for **standard** rotation (when [`options.rotate`](#rotate) is not set).

- `args` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) |
  [`<null>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#null_type)
  - If `null`, the _not-rotated file name_ must be returned.
  - Otherwise an object with both properties set:
    - `time` [`<Date>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
      By default: the time when rotation job started. If both [`options.interval`](#interval) and
      [`options.intervalBoundary`](#intervalboundary) options are enabled: the start time of rotation period.
    - `index` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#number_type) The
      progressive index of rotation by size in the same rotation period.

`index` is there so the generator can produce two distinct _rotated file names_ if more than one rotation happens inside
the same time window. That occurs when [`options.size`](#size) is reached more than once before
[`options.interval`](#interval) elapses: each extra size-based rotation in that interval still uses the same `time`, so
`index` is the value that keeps the destinations from colliding.

`index` is also passed when only [`options.interval`](#interval) is set, and when only [`options.size`](#size) is set.
When only [`options.interval`](#interval) is set, or when only [`options.size`](#size) is set, `index` is a safeguard:
if the name the generator would otherwise produce already exists on disk, the stream retries with a higher `index`
instead of overwriting the existing file.

The starting value of `index` depends only on [`options.size`](#size): that option is **necessary and sufficient** for
`index` to start from `1`. When [`options.size`](#size) is not set, `index` starts from `0`. Because of that, a
generator that always interpolates `index` into the file name will produce names like `...-0-file.log` unless it omits
`index` when it is `0`.

An example of a complex _rotated file name generator_ function could be:

```javascript
import { createStream } from "rotating-file-stream";

const pad = num => (num > 9 ? "" : "0") + num;
const generator = args => {
  if (!args) return "file.log";

  const { time, index } = args;
  const month = time.getFullYear() + "" + pad(time.getMonth() + 1);
  const day = pad(time.getDate());
  const hour = pad(time.getHours());
  const minute = pad(time.getMinutes());
  // Do not include the index in the file name when it is 0
  const idx = index ? `-${index}` : "";

  return `${month}/${month}${day}-${hour}${minute}${idx}-file.log`;
};

const stream = createStream(generator, {
  size: "10M",
  interval: "30m"
});
```

#### filename(index)

Used when classical **logrotate** behavior is enabled (by [`options.rotate`](#rotate)).

- `index` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#number_type) |
  [`<null>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#null_type) The progressive index of rotation. If `null`, the _not-rotated file name_ must be returned.

In this mode the _rotated file name_ is only a function of `index`.

## Class: RotatingFileStream

Extends [stream.Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable). It should not be directly
used. Exported only to be used with `instanceof` operator and similar.

`RotatingFileStream` emits all events emitted by [`EventEmitter`](https://nodejs.org/api/events.html#class-eventemitter),
[`stream.Stream`](https://nodejs.org/api/stream.html#class-streamstream) and
[`stream.Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable), plus the ones described below.

### Event: 'external'

- `stdout` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type) The
  standard output of the external compression command.
- `stderr` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type) The
  standard error of the external compression command.

The `external` event is emitted once an _external compression command_ completes its execution to give access to the
command output streams. It is emitted even when the command exits with a non-zero status, so listeners can inspect
`stdout` and `stderr` before handling the subsequent `error` event.

### Event: 'history'

The `history` event is emitted once the _history check job_ is completed.

### Event: 'open'

- `filename` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type) Is
  constant unless [`options.immutable`](#immutable) is `true`.

The `open` event is emitted once the _not-rotated file_ is opened.

### Event: 'removed'

- `filename` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type) The
  name of the removed file.
- `number` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  - `true` if the file was removed due to [`options.maxFiles`](#maxFiles)
  - `false` if the file was removed due to [`options.maxSize`](#maxSize)

The `removed` event is emitted once a _rotated file_ is removed due to [`options.maxFiles`](#maxFiles) or
[`options.maxSize`](#maxSize).

### Event: 'rotation'

The `rotation` event is emitted once the _rotation job_ is started.

### Event: 'rotated'

- `filename` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type) The
  _rotated file name_ produced.

The `rotated` event is emitted once the _rotation job_ is completed.

### Event: 'warning'

- `error` [`<Error>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) The
  non blocking error.

The `warning` event is emitted once a non blocking error happens.

## options

- [`compress`](#compress):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type) |
  [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type) |
  [`<Function>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function)
  Specifies compression method of rotated files. **Default:** `null`.
- [`encoding`](#encoding):
  [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type)
  Specifies the default encoding. **Default:** `'utf8'`.
- [`history`](#history):
  [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type)
  Specifies the _history filename_. **Default:** `null`.
- [`immutable`](#immutable):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  Never mutate file names. **Default:** `null`.
- [`initialRotation`](#initialRotation):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  Initial rotation based on _not-rotated file_ timestamp. **Default:** `null`.
- [`interval`](#interval):
  [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type)
  Specifies the time interval to rotate the file. **Default:** `null`.
- [`intervalBoundary`](#intervalBoundary):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  Makes rotated file name with lower boundary of rotation period. **Default:** `null`.
- [`intervalUTC`](#intervalutc):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  Boundaries for rotation are computed in UTC. **Default:** `null`.
- [`maxFiles`](#maxFiles):
  [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#number_type)
  Specifies the maximum number of rotated files to keep. **Default:** `null`.
- [`maxSize`](#maxSize):
  [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type)
  Specifies the maximum size of rotated files to keep. **Default:** `null`.
- [`mode`](#mode):
  [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#number_type)
  Forwarded to [fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options).
  **Default:** `0o666`.
- [`omitExtension`](#omitextension):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  Omits the `.gz` extension from compressed rotated files. **Default:** `null`.
- [`path`](#path):
  [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type)
  Specifies the base path for files. **Default:** `null`.
- [`rotate`](#rotate):
  [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#number_type)
  Enables the classical UNIX **logrotate** behavior. **Default:** `null`.
- [`size`](#size):
  [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type)
  Specifies the file size to rotate the file. **Default:** `null`.
- [`symLink`](#symlink):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  Creates a symbolic link with the not-rotated file name pointing to the file currently being written. **Default:**
  `null`.
- [`teeToStdout`](#teeToStdout):
  [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#boolean_type)
  Writes file content to `stdout` as well. **Default:** `null`.

### encoding

Specifies the default encoding that is used when no encoding is specified as an argument to
[stream.write()](https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback).

### mode

Forwarded to [fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options).

### path

If present, it is prepended to generated file names as well as for history file.

### teeToStdout

If `true`, it makes the file content to be written to `stdout` as well. Useful for debugging purposes.

### size

Accepts a positive integer followed by one of these possible letters:

- **B**: Bites
- **K**: KiloBites
- **M**: MegaBytes
- **G**: GigaBytes

```javascript
  size: '300B', // rotates the file when size exceeds 300 Bytes
                // useful for tests
```

```javascript
  size: '300K', // rotates the file when size exceeds 300 KiloBytes
```

```javascript
  size: '100M', // rotates the file when size exceeds 100 MegaBytes
```

```javascript
  size: '1G', // rotates the file when size exceeds a GigaByte
```

### interval

Accepts a positive integer followed by one of these possible letters:

- **s**: seconds. Accepts integer divider of 60.
- **m**: minutes. Accepts integer divider of 60.
- **h**: hours. Accepts integer divider of 24.
- **d**: days. Accepts integer.
- **M**: months. Accepts integer. **EXPERIMENTAL**

```javascript
  interval: '5s', // rotates at seconds 0, 5, 10, 15 and so on
                  // useful for tests
```

```javascript
  interval: '5m', // rotates at minutes 0, 5, 10, 15 and so on
```

```javascript
  interval: '2h', // rotates at midnight, 02:00, 04:00 and so on
```

```javascript
  interval: '1d', // rotates at every midnight
```

```javascript
  interval: '1M', // rotates at every midnight between two distinct months
```

### intervalBoundary

If set to `true`, the `time` property of _filename generator_ `args` is no longer the time when _rotation job_ started,
but the _lower boundary_ of rotation interval.

**Note:**
this option has effect only if [`options.interval`](#interval) is used.

### intervalUTC

If set to `true`, interval window boundaries are computed against UTC rather than against the system time zone.

With [`options.intervalBoundary`](#intervalboundary), those UTC boundaries are passed as the `time` property of the standard filename generator `args`. With [`options.initialRotation`](#initialrotation), the same UTC boundaries are used when comparing the not-rotated file mtime against the current interval window on stream open.

**Note:**
this option has effect only if at least one of [`options.intervalBoundary`](#intervalboundary) or
[`options.initialRotation`](#initialrotation) is used (both require [`options.interval`](#interval)).

### compress

The best choice here is to use the value `"gzip"` to use **Node.js** internal compression library.

For historical reasons external compression can be used.

To enable external compression, a _function_ can be used or simply the _boolean_ `true` value to use default
external compression.
The function should accept `source` and `dest` file names and must return the shell command to be executed to
compress the file.
The two following code snippets have exactly the same effect:

```javascript
import { createStream } from "rotating-file-stream";

const stream = createStream("file.log", {
  size: "10M",
  compress: true
});
```

```javascript
import { createStream } from "rotating-file-stream";

const stream = createStream("file.log", {
  size: "10M",
  compress: (source, dest) => `cat ${source} | gzip -c9 > ${dest}`
});
```

**Note:**
this option is ignored if [`options.immutable`](#immutable) is used.

**Note:**
the shell command to compress the rotated file should not remove the source file, it will be removed by the package
if the rotation job completes with success.

### omitExtension

From **v3** the package adds by default the `.gz` extension to the rotated compressed files. Simultaneously this option
was added: set this option to `true` to not add the extension, i.e. to keep backward compatibility.

### initialRotation

When program stops in a rotation period then restarts in a new rotation period, logs of different rotation period will
go in the next rotated file; in a few words: a rotation job is lost. If this option is set to `true` an initial check
is performed against the _not-rotated file_ timestamp and, if it falls in a previous rotation period, an initial
rotation job is done as well.

**Note:**
this option has effect only if [`options.interval`](#interval) is used. When [`options.intervalUTC`](#intervalutc)
is also enabled, the initial check uses UTC interval boundaries. [`options.intervalBoundary`](#intervalboundary) is
not required: without it, the period comparison is the same but the rotated file name uses the rotation job start
time rather than the window lower boundary.

**Note:**
this option is ignored if [`options.rotate`](#rotate) or [`options.immutable`](#immutable) are used.

### rotate

If specified, classical UNIX **logrotate** behavior is enabled and the value of this option has same effect in
_logrotate.conf_ file.

**Note:**
if this option is used following ones take no effect: [`options.history`](#history), [`options.immutable`](#immutable),
[`options.initialRotation`](#initialrotation), [`options.intervalBoundary`](#intervalboundary),
[`options.intervalUTC`](#intervalutc), [`options.maxFiles`](#maxfiles), [`options.maxSize`](#maxsize).

### immutable

If set to `true`, names of generated files never changes. New files are immediately generated with their rotated
name. In other words the _rotated file name generator_ is never called with a `null` argument unless to
determinate the _history file_ name; this can happen if [`options.history`](#history) is not used while
[`options.maxFiles`](#maxfiles) or [`options.maxSize`](#maxsize) are used.
The `filename` argument passed to [`'open'`](#event-open) _event_ evaluates now as the newly created file name.

Useful to send logs to logstash through [filebeat](https://www.elastic.co/beats/filebeat).

**Note:**
if this option is used, [`options.compress`](#compress) is ignored.

**Note:**
this option is ignored if [`options.interval`](#interval) is not used.

### symLink

If set to `true`, a symbolic link is created with the _not-rotated file name_, pointing to the file that is currently
receiving writes.

**Note:**
this option takes effect only if [`options.immutable`](#immutable) is used.

### history

Due to the complexity that _rotated file names_ can have because of the _filename generator function_, if number or
size of rotated files should not exceed a given limit, the package needs a file where to store this information. This
option specifies the name _history file_. This option takes effect only if at least one of
[`options.maxFiles`](#maxfiles) or [`options.maxSize`](#maxsize) is used. If `null`, the _not rotated filename_ with
the `'.txt'` suffix is used.

### maxFiles

If specified, it's value is the maximum number of _rotated files_ to be kept.

### maxSize

If specified, it's value must respect same syntax of [option.size](#size) and is the maximum size of _rotated files_ to
be kept.

# Rotation logic

Regardless of when and why rotation happens, the content of a single
[stream.write](https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback)
will never be split among two files.

## by size

Once the _not-rotated_ file is opened first time, its size is checked and if it is greater or equal to
size limit, a first rotation happens. After each
[stream.write](https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback),
the same check is performed.

## by interval

The package sets a [Timeout](https://nodejs.org/api/timers.html#timers_settimeout_callback_delay_args)
to start a rotation job at the right moment.

# Under the hood

Logs should be handled so carefully, so this package tries to never overwrite files.

At stream creation, if the _not-rotated_ log file already exists and its size exceeds the rotation size,
an initial rotation attempt is done.

At each rotation attempt a check is done to verify that destination rotated file does not exists yet;
if this is not the case a new destination _rotated file name_ is generated and the same check is
performed before going on. This is repeated until a not existing destination file name is found or the
package is exhausted. For this reason the _rotated file name generator_ function could be called several
times for each rotation job.

If requested through [`options.maxFiles`](#maxfiles) or [`options.maxSize`](#maxsize), at the end of a rotation job, a
check is performed to ensure that given limits are respected. This means that
**while rotation job is running both the limits could be not respected**. The same can happen till the end of first
_rotation job_ if [`options.maxFiles`](#maxfiles) or [`options.maxSize`](#maxsize) are changed between two runs.
The first check performed is the one against [`options.maxFiles`](#maxfiles), in case some files are removed, then the
check against [`options.maxSize`](#maxsize) is performed, finally other files can be removed. When
[`options.maxFiles`](#maxfiles) or [`options.maxSize`](#maxsize) are enabled for first time, an _history file_ can be
created with one _rotated filename_ (as returned by _filename generator function_) at each line.

Once an **error** _event_ is emitted, nothing more can be done: the stream is closed as well.

# Compatibility

Requires **Node.js v22**.

The package is tested under [all Node.js versions](https://github.com/iccicci/rotating-file-stream/actions/workflows/build.yml)
currently supported accordingly to [Node.js Release](https://github.com/nodejs/Release#readme).

To work with the package under Windows, be sure to configure `bash.exe` as your _script-shell_.

```
> npm config set script-shell bash.exe
```

# TypeScript

**TypeScript** types are distributed with the package itself.

# License

[MIT License](https://github.com/iccicci/rotating-file-stream/blob/master/LICENSE)

# Bugs

Do not hesitate to report any bug or inconsistency [@github](https://github.com/iccicci/rotating-file-stream/issues).

# ChangeLog

[ChangeLog](https://github.com/iccicci/rotating-file-stream/blob/master/CHANGELOG.md)

# Donating

If you find useful this package, please consider the opportunity to donate some satoshis to this bitcoin address:
**12p1p5q7sK75tPyuesZmssiMYr4TKzpSCN**
