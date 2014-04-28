assert = require('assert');
util = require('util');
modeler = require('../');
idgen = require('idgen');

extraOptions = {
  db: null,
  dbPrefix: null
};

setUp = function () {
  extraOptions.db = require('nano')('http://localhost:5984/');
  extraOptions.dbPrefix = 'modeler-couchdb-test-' + idgen().toLowerCase();
};

tearDown = function (done) {
  var re = new RegExp('^' + extraOptions.dbPrefix);
  extraOptions.db.db.list(function (err, resp) {
    if (err) return done(err);
    var dbs = resp.filter(function (db) {
      return re.test(db);
    });
    var latch = dbs.length;
    dbs.forEach(function (db) {
      extraOptions.db.db.destroy(db, function () {
        if (!--latch) done();
      });
    });
  });
};