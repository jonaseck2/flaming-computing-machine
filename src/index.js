'use strict';
var mongodb = require('mongodb');
var pkg = require('../package');
var queue = require('./queue');
var docker = require('./docker');
var MongoClient = mongodb.MongoClient;
var dbHost = process.env.MONGO_HOST || 'localhost';
var dbName = 'inhouse';
var db;

// connect to mongo:
MongoClient.connect('mongodb://' + dbHost + '/' + dbName, function (err, database) {
  if (err) {
    throw err;
  }
  db = database;

  log(pkg.name + ' is running...');

  startBuilder();
});

function startBuilder (err) {
  if (err) {
    error(err);
  }
  function next (err) {
    // Using setTimeout to not trigger builds all the time
    // plus not worrying about stack overflow:
    setTimeout(function () {
      startBuilder(err);
    }, 100);
  }

  // TODO: Make this promisified for less callback nesting...

  queue.next(db, function (err, build) {
    if (err) {
      error(err);
      error('FATAL. Shutting down...');
      process.exit(1);
      return;
    }

    if (build) {
      log(build.fullName + ' building...');
      // Get current running container ids for build:
      docker.getRunning(build, function (err, oldContainers) {
        // Build the container:
        docker.build(build, function (err) {
          build.nrOfAttempts += 1;
          build.buildAt = new Date();

          if (err) {
            error(build.fullName + ' failed!');
            build.message = err.message;
          } else {
            log(build.fullName + ' succeeded!');
            build.isSuccessful = true;
          }

          // Update db with build status:
          queue.update(db, build, function (err) {
            if (err) {
              return next(err);
            }
            if (!build.isSuccessful) {
              return next();
            }
            // If the build were successful, run the container:
            docker.run(build, function (err, containerName) {
              if (err) {
                return next(err);
              }
              // After 10 seconds, see if the container is still running
              // if so, kill the old containers for the same build.
              setTimeout(function () {
                docker.isRunning(containerName, function (err, isRunning) {
                  if (err) {
                    return next(err);
                  }
                  if (!isRunning) {
                    error(build.fullName + '. Container: ' + containerName + ', didn\'t run for 10 seconds');
                    return next();
                  }
                  log(build.fullName + '. Container: ' + containerName + ', up and running.');
                  docker.kill(oldContainers, next);
                });
              }, 10 * 1000);
            });
          });
        });
      });
    } else {
      next();
    }
  });
}

// Small logging utils:

function error () {
  var args = Array.prototype.slice.call(arguments);
  var now = new Date().toString();
  console.error.apply(console, ['[' + now + ']'].concat(args));
}
function log () {
  var args = Array.prototype.slice.call(arguments);
  var now = new Date().toString();
  console.log.apply(console, ['[' + now + ']'].concat(args));
}
