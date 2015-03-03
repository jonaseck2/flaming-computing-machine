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

  queue.next(db, function (err, build) {
    if (err) {
      error(err);
      error('FATAL. Shutting down...');
      process.exit(1);
      return;
    }

    if (build) {
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

        queue.update(db, build, next);
      });
    } else {
      next()
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
