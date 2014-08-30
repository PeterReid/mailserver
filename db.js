var sqlite3 = require('sqlite3');
var EventEmitter = require("events").EventEmitter;
var util = require('util');
var crypto = require('crypto');
var fs = require('fs');

function MailDb(path) {
  EventEmitter.call(this);
  this.db = new sqlite3.Database(path, this.onDatabaseOpened.bind(this));
}
util.inherits(MailDb, EventEmitter);

MailDb.prototype.onDatabaseOpened = function(err) {
  if (err) {
    console.log('Database open failed!', err);
    process.exit(1);
  }
  
  this.db.exec(
      "CREATE TABLE IF NOT EXISTS user"
    + "(id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT "
    + ",username TEXT NOT NULL UNIQUE"
    + ",password TEXT NOT NULL"
    + ");"
    
    + "CREATE TABLE IF NOT EXISTS message"
    + "(id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT "
    + ",userId INTEGER NOT NULL"
    + ",uniqueId TEXT NOT NULL UNIQUE"
    + ",body BLOB"
    + ",FOREIGN KEY(userId) REFERENCES user(id)"
    + ");"
    
    , this.onDatabasePrepared.bind(this));
}

MailDb.prototype.onDatabasePrepared = function(err) {
  if (err) {
    console.log('Database prepare failed!', err);
    process.exit(1);
  }
  
  this.emit('ready');
}

MailDb.prototype.storeMessage = function(username, body, cb) {
  var userId;
  var uniqueId;
  var db = this.db;
  
  function start() {
    generateUniqueId();
  }
  function generateUniqueId() {
    crypto.randomBytes(16, gotUniqueId);
  }
  function gotUniqueId(err, buf) {
    if (err) return cb(err);
    uniqueId = buf.toString('hex');
    console.log(uniqueId);
    lookUpUserId();
  }
  function lookUpUserId() {
    db.get('SELECT id FROM user WHERE username = ?', username, gotUserId);
  }
  function gotUserId(err, row) {
    if (err) return cb('An internal database error occurred.');
    if (!row) return cb('No such user exists');
    
    userId = row.id;
    
    insertMessage();
  }
  function insertMessage(err, row) {
    db.run('INSERT INTO message (userId, uniqueId, body) VALUES (?, ?, ?)',
      userId, uniqueId, body, insertedMessage);
  }
  function insertedMessage(err) {
    if (err) return cb(err);
    return cb();
  }
  
  start();
}

MailDb.prototype.getSessionMarker = function(cb) {
  var db = this.db;
  function start() {
    db.get('SELECT MAX(id) AS maxId FROM message', gotMaxId);
  }
  function gotMaxId(err, row) {
    if (err) return cb(err);
    cb(null, row.maxId);
  }
  
  start();
}

MailDb.prototype.getSessionInfo = function(username, cb) {
  var db = this.db;
  function start() {
    db.all('SELECT id, LENGTH(body) AS length, uniqueId FROM message WHERE userId = (SELECT id FROM user WHERE username = ?) ORDER BY id ASC', username, gotInfo);
  }
  function gotInfo(err, rows) {
    if (err) return cb(err);
    
    cb(null, rows);
  }
  
  start();
}

MailDb.prototype.getMessage = function(id, cb) {
  var db = this.db;
  function start() {
    db.get('SELECT body FROM message WHERE id = ?', id, gotBody);
  }
  function gotBody(err, row) {
    if (err) return cb(err);
    
    cb(null, ''+row.body);
  }
  
  start();
}

MailDb.prototype.deleteMessages = function(idList, cb) {
  if (idList.length==0) return cb();
  
  for (var i=0; i<idList.length; i++) {
    if (idList[i] !== (idList[i]|0)) {
      return cb('Invalid ID list')
    }
  }
  
  this.db.run('DELETE FROM message WHERE id IN (' + idList.join(', ') + ')', cb);
}

MailDb.prototype.authenticate = function(username, password, cb) {
  var db = this.db;
  var passwordDigest;
  var passwordSalt;
  
  var errorMessage = 'Invalid username or password';
  
  function start() {
    console.log(username)
    db.get('SELECT password FROM user WHERE username = ?', username, gotPasswordHash);
  }
  function gotPasswordHash(err, row) {
    if (err) return cb(err);
    console.log(row)
    if (!row) return cb(errorMessage);
    
    var m = (''+row.password).match(/^([0-9a-f]+)\$([0-9a-f]+)$/);
    if (!m) {
      console.log('Invalid salt/digest stored for ' + username);
      return cb(errorMessage);
    }
    passwordSalt = m[1];
    passwordDigest = m[2];
    
    checkHash();
  }
  function checkHash() {
    crypto.pbkdf2(password, new Buffer(passwordSalt, 'hex'), 1000, 32, digested);
  }
  function digested(err, digest) {
    if (err) return cb(err);
    
    var digestHex = new Buffer(digest, 'ascii').toString('hex')
    console.log('digested',digestHex);
    if (digestHex != passwordDigest) { // Non-constant time compare, but that is OK because neither of these strings are controlled by the attacker
      return cb(errorMessage);
    }
    return cb();
  }
  
  start();
}

MailDb.prototype._digestPassword = function(password, cb) {
  var salt;
  function start() {
    generateSalt();
  }
  function generateSalt() {
    crypto.randomBytes(32, gotSalt);
  }
  function gotSalt(err, saltBuf) {
    if (err) return cb(err);
    salt = saltBuf;
    beginDigest();
  }
  
  function beginDigest() {
    crypto.pbkdf2(password, salt, 1000, 32, digested);
  }
  function digested(err, digest) {
    if (err) return cb(err);
    
    var digestHex = new Buffer(digest, 'ascii').toString('hex');
    var saltHex = salt.toString('hex');
    cb(null, saltHex + '$' + digestHex);
  }
  
  start();
};

MailDb.prototype.createUser = function(username, passwordRaw, cb) {
  var self = this;
  var db = this.db;
  
  var passwordDigest;
  
  function start() {
    beginDigest();
  }
  function beginDigest() {
    self._digestPassword(passwordRaw, digestedPassword);
  }
  function digestedPassword(err, digest) {
    if (err) return cb(err);
    
    passwordDigest = digest;
    beginInsert();
  }
  function beginInsert() {
    db.run('INSERT INTO user(username, password) VALUES (?, ?);', username, passwordDigest, afterInsert);
  }
  function afterInsert(err) {
    if (err) {
      if (err.message.indexOf('UNIQUE constraint failed: user.username')>=0) return cb(new Error('User already exists'));
      return cb(err);
    }
    
    cb();
  }
  
  start();
}

/*
var mdb = new MailDb('mail.db');
mdb.on('ready', function() {
  console.log('ready!');
  mdb.storeMessage('peter@peterreid.net', fs.readFileSync('message.txt'), function(err) {
    console.log(err)
    
    mdb.getSessionInfo('peter@peterreid.net', function(err, info) {
      console.log(err, info)
      var anId = info[0].id;
      
      mdb.getMessage(anId, function(err, body) {
        console.log(body.substr(0,50) + '...');
        mdb.deleteMessages([anId], function(err) {
          console.log('deleted', err)
        });
      });
    });
  });
  
  mdb.authenticate('peter@peterreid.net', 'p2', function(err) {
    console.log(err);
  });
  
  
});
*/

exports = module.exports = MailDb;