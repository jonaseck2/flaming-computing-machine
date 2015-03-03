'use strict';
var spawn = require('child_process').spawn;

exports.build = function build (build, cb) {
  buildImage(build.repo, build.fullName.toLowerCase(), cb);
};

function buildImage (repo, tag, cb) {
  var docker = spawn('docker', ['build', '-t', tag, repo]);

  var data = '';

  docker.stdout.on('data', function (d) {
    data += d;
  });

  docker.stderr.on('data', function (d) {
    data += d;
  });

  docker.on('close', function (code) {
    if (code !== 0) {
      return cb(new Error(data));
    }
    return cb();
  });
}
