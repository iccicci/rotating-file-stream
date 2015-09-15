function none() {}

if(process.version.match(/^v0.10/))
	setTimeout(none, 20000);

if(process.version.match(/^v0.11/))
	setTimeout(none, 10000);
