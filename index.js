var modeler = require('modeler')
  , microtime = require('microtime');

module.exports = function (_opts) {
  var api = modeler(_opts)
    , couchProps = [ '_id', '_rev', '_attachments', '_deleted', '_revisions', '_revs_info', '_conflicts', '_deleted_conflicts', '_local_seq', 'doc' ]
    , nonErrors = [ 'missing', 'deleted' ];

  if (!api.options.db) throw new Error('must pass a nano couch db with options.db');

  var db
    , nano = api.options.db
    , name = api.options.dbPrefix + '$' + api.options.name;

  // for the command queue
  var q = [], blocking = false;

  function continuable (skip, limit, reverse, cb) {
    (function next () {
      var options = {};
      options.descending = !!reverse;
      options.skip = skip || 0;
      if (limit) {
        options.limit = limit;
      }
      q.push(['list', options, function (err, response) {
        if (err) return cb(err);
        var results = response.rows.map(function (row) { return row.id; });
        skip += results.length;
        cb(null, results, next);
      }]);
      onConnect();
    })();
  }

  api._beforeSave = function (entity) {
    var e = api.copy(entity);
    e.doc || (e.doc = {});
    // Our actual doc can't live at the root namespace due to CouchDB property
    // name retrictions: http://wiki.apache.org/couchdb/HTTP_Document_API#Special_Fields
    Object.keys(e).forEach(function (prop) {
      if (couchProps.indexOf(prop) === -1) {
        e.doc[prop] = e[prop];
        delete e[prop];
      }
    });
    return e;
  };

  api._afterSave = function (response) {
    var entity = {
      '_rev': response.rev
    };
    return entity;
  };

  api._afterLoad = function (entity) {
    entity.id = entity._id;
    delete entity._id;
    entity.doc || (entity.doc = {});
    Object.keys(entity.doc).forEach(function (prop) {
      entity[prop] = entity.doc[prop];
    });
    entity.created = new Date(entity.created);
    entity.updated = new Date(entity.updated);
    delete entity.doc;
    return entity;
  };

  api._head = function (skip, limit, cb) {
    continuable(skip, limit, false, cb);
  };
  api._tail = function (skip, limit, cb) {
    continuable(skip, limit, true, cb);
  };
  api._save = function (entity, cb) {
    entity.__idx || (entity.__idx = microtime.now());
    q.push(['insert', api._beforeSave(entity), entity.id, function (err, response) {
      if (err) return cb(err);
      cb(null, api._afterSave(response));
    }]);
    onConnect();
  };
  api._load = function (id, cb) {
    q.push(['get', id, function (err, entity) {
      if (err) {
        if (nonErrors.indexOf(err.message) === -1) return cb(err);
        else return cb();
      }
      cb(err, api._afterLoad(entity));
    }]);
    onConnect();
  };
  api._destroy = function (id, cb) {
    api._load(id, function (err, entity) {
      if (err) return cb(err);
      db.destroy(id, entity._rev, cb);
    });
  };

  return api;

  // CouchDB has no concept of "tables" (SQL) or "collections" (MongoDB),
  // so every collection of documents must be in its own database. But,
  // we want them namespaced so that two applications can have collections
  // with the same name.

  // Implemented as command queue to ensure execution order of async operations
  // Lifted and adapted from https://github.com/carlos8f/modeler-leveldb
  function onConnect () {
    if (blocking || !q.length) return;

    function unblock () {
      blocking = false;
      (typeof setImmediate === 'function' ? setImmediate : process.nextTick)(onConnect);
    }

    blocking = true;
    var args = q.shift();
    var method = args.shift();
    var cb = args.pop();
    args.push(onConnected);

    if (db) return doDb();
    nano.db.get(name, function (err) {
      if (err) {
        nano.db.create(name, function (err) {
          if (err) return onConnected(err);
          doDb(nano.db.use(name));
        });
      }
      else doDb(nano.db.use(name));
    });

    function doDb (_db) {
      if (_db) db = _db;
      db[method].apply(db, args);
    }

    function onConnected (err, response) {
      unblock();
      cb(err, response);
    }
  }
};