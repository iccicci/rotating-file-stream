# rotating-file-stream-4js

![Build Status](https://github.com/iccicci/rotating-file-stream/actions/workflows/build.yml/badge.svg)
![codecov](https://codecov.io/gh/iccicci/rotating-file-stream/graph/badge.svg)
![NPM version](https://img.shields.io/npm/v/rotating-file-stream-4js?color=green&logo=npm)

![Donate](https://img.shields.io/static/v1?label=donate&message=bitcoin&color=blue&logo=bitcoin)

### Description

[log4js](https://github.com/log4js-node/log4js-node) appender that writes through
[rotating-file-stream](https://www.npmjs.com/package/rotating-file-stream).

### Usage

```javascript
import log4js from "log4js";

log4js.configure({
  appenders: {
    out: {
      type: "rotating-file-stream-4js",
      rfs: {
        filename: "file.log",
        options: { size: "10M", interval: "1d", compress: "gzip" },
        onStream: stream => {
          stream.on("rotated", console.log);
        }
      }
    }
  },
  categories: {
    default: { appenders: ["out"], level: "info" }
  }
});

const log = log4js.getLogger();
log.info("hello");
```

### Installation

With [npm](https://www.npmjs.com/package/rotating-file-stream-4js):

```sh
$ npm install --save rotating-file-stream-4js
```

### Table of contents

- [Configuration](#configuration)
  - [rfs](#rfs)
- [Using the same stream for more appenders](#using-the-same-stream-for-more-appenders)
- [Compatibility](#compatibility)
- [TypeScript](#typescript)
- [License](#license)
- [Bugs](#bugs)
- [ChangeLog](#changelog)
- [Donating](#donating)

# Configuration

The appender accepts the usual log4js appender fields, plus a required `rfs` object.

```javascript
{
  type: "rotating-file-stream-4js",
  layout: { type: "basic" },
  timezoneOffset: 0,
  rfs: {
    filename: "file.log",
    options: { size: "10M" },
    onStream: stream => {
      stream.on("rotated", console.log);
    }
  }
}
```

The module object can also be passed as `type` (useful with bundlers):

```javascript
import rotatingFileStream4js from "rotating-file-stream-4js";

log4js.configure({
  appenders: {
    out: {
      type: rotatingFileStream4js,
      rfs: {
        filename: "file.log",
        options: { size: "10M" },
        onStream: stream => {
          stream.on("rotated", console.log);
        }
      }
    }
  },
  categories: { default: { appenders: ["out"], level: "info" } }
});
```

## rfs

Required when the appender creates the stream (`type: "rotating-file-stream-4js"`). Ignored when the
appender comes from [`shareStream`](#using-the-same-stream-for-more-appenders).

- `filename` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) |
  [`<Function>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function):
  First argument of
  [`createStream(filename[, options])`](https://github.com/iccicci/rotating-file-stream#createstreamfilename-options).
  **Required.**
- `options` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object):
  Second argument of
  [`createStream(filename[, options])`](https://github.com/iccicci/rotating-file-stream#createstreamfilename-options).
  Same shape as
  [rotating-file-stream `Options`](https://github.com/iccicci/rotating-file-stream#options).
- `onStream` [`<Function>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function):
  Called synchronously with the opened stream before any log line is written, so listeners can be attached.

# Using the same stream for more appenders

With the standard configuration each appender opens its own stream. When several appenders must write
through one shared stream, use `shareStream`: it returns a log4js appender module bound to that stream,
and each appender entry can still set its own `layout` and `timezoneOffset`.

```javascript
import log4js from "log4js";
import { createStream, shareStream } from "rotating-file-stream-4js";

const stream = createStream("file.log", { size: "10M", interval: "1d" });
const shared = shareStream(stream);

stream.on("rotated", console.log);

log4js.configure({
  appenders: {
    app: {
      type: shared,
      layout: { type: "pattern", pattern: "APP %m" }
    },
    access: {
      type: shared,
      layout: { type: "pattern", pattern: "ACCESS %m" }
    }
  },
  categories: {
    default: { appenders: ["app"], level: "info" },
    access: { appenders: ["access"], level: "info" }
  }
});
```

# Compatibility

Requires **Node.js v22** and a current [log4js](https://www.npmjs.com/package/log4js) release.

# TypeScript

**TypeScript** types are distributed with the package itself. Everything exported by
`rotating-file-stream` is re-exported, so a single import is enough.

# License

[MIT License](https://github.com/iccicci/rotating-file-stream/blob/master/LICENSE)

# Bugs

Do not hesitate to report any bug or inconsistency [@github](https://github.com/iccicci/rotating-file-stream/issues).

# ChangeLog

[ChangeLog](https://github.com/iccicci/rotating-file-stream/blob/master/CHANGELOG.md)

# Donating

If you find useful this package, please consider the opportunity to donate some satoshis to this bitcoin address:
**12p1p5q7sK75tPyuesZmssiMYr4TKzpSCN**
