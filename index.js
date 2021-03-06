var browser;
var bundlePath = '/__mocha-browse-bundle.js';

module.exports = function(opts, cb) {
  var params = require('url').parse(opts.url);

  insertBundle(opts.url, function(err, webpageContent) {
    if (err) {
      return cb(err)
    }

    createProxy(opts.url, webpageContent, opts.quiet, function(err, proxyPort) {
      launchBrowser(opts.url, opts.browser, proxyPort, cb);
    }, cb);
  })
}

function launchBrowser(to, askedBrowser, proxyPort, cb) {
  var url = require('url');
  var params = url.parse(to);

  params.port = proxyPort;
  params.hostname = '127.0.0.1';
  delete params.host;

  var launcher = require('browser-launcher');

  launcher(function(err, launch) {
    if (err) return cb(err);

    launch(url.format(params), {
      browser: askedBrowser || launch.browsers.local[0].name,
      headless: true
    }, function(err, ps) {
      browser = ps;
      if (err) {
        return cb(err);
      }
    });
  });
}

function createProxy(url, webpageContent, quiet, ready, cb) {
  var params = require('url').parse(url);

  var finished = require('tap-finished');
  var xws = require('xhr-write-stream')();
  var http = require('http');
  var fs = require('fs');
  var prelude = fs.readFileSync(__dirname + '/bundle.js', 'utf8');

  var server = http.createServer(function (req, res) {
    if (req.url === params.path) {
      res.setHeader('content-type', 'text/html');
      res.end(webpageContent);
    } else if (/mocha.js$/.test(req.url)) {
      sendModifiedMocha(params, req, res);
    } else if (req.url === '/sock') {
      req.pipe(xws(function (stream) {
        if (quiet !== true) {
          stream.pipe(process.stdout, { end: false });
        }
        stream.pipe(finished(function (results) {
          browser.kill();
          if (results.ok) {
            cb(null);
          }
          else {
            cb(new Error('Some tests did not pass on ' + url));
          }
        }));
      }));
      req.on('end', res.end.bind(res));
    } else if (req.url === bundlePath) {
      res.setHeader('content-type', 'application/javascript');
      res.end(prelude);
    } else {
      proxy(params, req, res);
    }
  });

  server.listen(0, function() {
    ready(null, this.address().port);
  });
}

function proxy(params, req, res) {
  var request = require('request');
  request.get(params.protocol + '//' + params.host + req.url).pipe(res);
}

function insertBundle(url, cb) {
  var params = require('url').parse(url);
  var request = require('request');
  var bundleScript = '<script src=' + bundlePath + '></script>';

  request({
    url: params.href,
    headers: {
      host: params.host
    }
  }, function(err, response, body) {
    if (err) {
      return cb(err);
    }

    cb(null, body.replace('<script', bundleScript + '\n<script'));
  });
}

function sendModifiedMocha(params, req, res) {
  var request = require('request');

  request({
    url: params.protocol + '//' + params.host + req.url,
    headers: {
      host: params.host
    }
  }, function(err, _res, body) {
    var search = 'for (var opt in opts)';
    var replace = 'opts.reporter = \'tap\';' + search;
    res.setHeader('content-type', 'application/javascript');
    res.end(body.replace(search, replace));
  });
}