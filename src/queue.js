'use strict';

exports.next = function next (db, cb) {
  // Find the oldest build which is not successful and have 5 or less build attempts:
  db.collection('buildqueue')
    .find(
      {isSuccessful: false, nrOfAttempts: {$lte: 5}},
      {limit: 1, sort: [['createdAt', 'ascending']]}
    )
    .toArray(function (err, builds) {
      if (err) {
        return cb(err);
      }
      return cb(null, builds[0]);
    });
};

exports.update = function update (db, build, cb) {
  var buildqueue = db.collection('buildqueue');

  if (build.isSuccessful) {
    // Tag other related unsuccessful builds as successful as well:
    buildqueue.update(
      {
        repo: build.repo,
        commit: build.commit,
        isSuccessful: false,
        _id: {$ne: build._id}
      },
      {
        $set: {
          isSuccessful: true,
          message: 'cleared by other build with same commit',
          buildAt: build.buildAt
        }
      },
      {w: 1},
      function (err) {
        if (err) {
          return cb(err);
        }
        update();
      }
    );
  } else {
    update();
  }

  function update () {
    buildqueue.update({_id: build._id}, build, {w: 1}, cb);
  }
};
