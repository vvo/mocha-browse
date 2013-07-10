#!/usr/bin/env node
var runner = require('./index.js');
var url = process.argv[2];
var browser = process.argv[3];

if (!url) {
	console.error('Usage: mocha-webpage-runner http://test.com');
	process.exit(1);
}

runner(url, browser, function(err) {
	if (err) {
		console.error(err);
		process.exit(1);
	} else {
		process.exit(0);
	}
})