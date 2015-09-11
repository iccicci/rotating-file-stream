# rotating-file-stream

[![Build Status](https://travis-ci.org/iccicci/rotating-file-stream.png)](https://travis-ci.org/iccicci/rotating-file-stream)
[![Code Climate](https://codeclimate.com/github/iccicci/rotating-file-stream/badges/gpa.svg)](https://codeclimate.com/github/iccicci/rotating-file-stream)
[![Test Coverage](https://codeclimate.com/github/iccicci/rotating-file-stream/badges/coverage.svg)](https://codeclimate.com/github/iccicci/rotating-file-stream/coverage)
[![Donate](http://img.shields.io/bitcoin/donate.png?color=red)](https://www.coinbase.com/cicci)

[![dependency status](https://david-dm.org/iccicci/rotating-file-stream.svg)](https://david-dm.org/iccicci/rotating-file-stream#info=dependencies)
[![dev dependency status](https://david-dm.org/iccicci/rotating-file-stream/dev-status.svg)](https://david-dm.org/iccicci/rotating-file-stream#info=devDependencies)

[![NPM](https://nodei.co/npm/rfs.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/rfs/)

## Example

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

[fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options)
