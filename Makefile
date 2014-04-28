test:
	@./node_modules/.bin/mocha \
		--reporter spec \
		--bail \
		--timeout 5s \
		--require test/common.js

test-clean:
	@curl -s http://localhost:5984/_all_dbs | node -e "var data = ''; \
		process.stdin.setEncoding('utf8'); \
		process.stdin.on('readable', function () { \
		  var chunk = this.read(); \
		  if (chunk !== null) { \
		    data += chunk; \
		  } \
		}); \
		process.stdin.on('end', function () { \
		  var re = new RegExp('^' + 'modeler-couchdb-test-'); \
		  JSON.parse(data).forEach(function (db) { \
		    re.test(db) && console.log(db); \
		  }); \
		});" | xargs -I db sh -c "echo Deleting 'db' && curl -X DELETE 'http://localhost:5984/db'"

.PHONY: test
.PHONY: test-clean
