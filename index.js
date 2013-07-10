var browser;

module.exports = function(url, askedBrowser, cb) {
  var params = require('url').parse(url);

  insertBundle(url, function(err, webpageContent) {
    if (err) {
      return cb(err)
    }

    createProxy(url, webpageContent, function(err, proxyPort) {
      launchBrowser(url, askedBrowser, proxyPort, cb);
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

function createProxy(url, webpageContent, ready, cb) {
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
          stream.pipe(process.stdout, { end: false });
          stream.pipe(finished(function (results) {
              if (results.ok) {
                browser.kill();
                cb(null);
              }
              else {
                cb(new Error('Some tests did not pass'));
              }
          }));
      }));
      req.on('end', res.end.bind(res));
    } else if (req.url === '/__mocha-webpage-runner-bundle.js') {
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
  var httpProxy = require('http-proxy');
  var proxy = new httpProxy.RoutingProxy();

  req.headers.host = params.host;
  proxy.proxyRequest(req, res, {
      host: params.hostname,
      port: params.port || 80
  });
}

function insertBundle(url, cb) {
  var params = require('url').parse(url);
  var request = require('request');
  var bundleScript = '<script src=/__mocha-webpage-runner-bundle.js></script>';

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