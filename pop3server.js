var net = require('net');
var tls = require('tls');
var ClientParser = require('./node_modules/smtp-protocol/lib/client/parser');
var fs = require('fs');

var messages = [
  { body: fs.readFileSync('message.txt'),
    uid: 'message1' }
];

function computeStats(session) {
  var size = 0;
  for (var i=0; i<session.length; i++) {
    size += session[i].length;
  }
  
  return {size: size, count: session.length};
}
function getLengths(session) {
  return session.map(function(message) { return message.length });
}
function getUids(session) {
  return session.map(function(message) { return message.uniqueId });
}

function getCredentialsFrom(buf) {
  if (buf.length<2) return null;
  if (buf[0] != 0) return null;
  
  var div = 1;
  while (div<buf.length && buf[div]!=0) {
    div++;
  }
  if (div == buf.length) return null;
  
  var username = buf.slice(1, div).toString();
  var password = buf.slice(div+1, buf.length).toString();
  return { username: username, password: password };
}

function createServer(opts, db /*: MailDb*/) {
  return tls.createServer(opts, function(c) {
    console.log('got connection')
    var p = new ClientParser(c);
    
    var username;
    var session;
    var deleted = {};
    
    c.on('data', function(d) {
      console.log('<- ', d.toString())
    });
    function round() {
      p.getCommand(function(err, cmd) {
        console.log('getCommand returned',err,cmd);
        if (cmd.name == 'capa') {
          c.write(
           '+OK List of capabilities follows\r\n' +
           'SASL PLAIN DIGEST-MD5 GSSAPI ANONYMOUS\r\n' +
           'STLS\r\n' +
           'IMPLEMENTATION BlurdyBlurp POP3 server\r\n' +
           '.\r\n');
           round();
        } else if (cmd.name == 'auth') {
          if (cmd.data != 'PLAIN' && cmd.data!==undefined) {
            console.log('I only know plain!');
            c.end();
            return;
          }
          
          c.write('+ \r\n');
          p.getLine(function(line) {
            var buf = new Buffer(line, 'base64');
            var credentials = getCredentialsFrom(buf);
            if (!credentials) {
              console.log('getting credentials failed');
              c.end();
              return;
            }
            
            db.authenticate(credentials.username, credentials.password, function(err) {
              console.log('auth returned', err);
              if (err) {
                c.write('-ERR Invalid username or password\r\n');
                round();
                return;
              }
              
              db.getSessionInfo(credentials.username, function(err, _session) {
                console.log('got session info!', _session);
                if (err) {
                  c.write('-ERR Invalid username or password\r\n');
                  round();
                  return;
                }
                session = _session;
                username = credentials.username;
                c.write('+OK Plain authentication succeeded\r\n');
                round();
              });
            });
          });
        } else if (cmd.name == 'stat') {
          var stats = computeStats(session);
          c.write('+OK ' + stats.count + ' ' + stats.size + '\r\n');
          round();
        } else if (cmd.name == 'list') {
          var lengths = getLengths(session);
          c.write('+OK Listing\r\n');
          for (var i=0; i<lengths.length; i++) {
            c.write((i+1) + ' ' + lengths[i] + '\r\n')
          }
          c.write('.\r\n');
          round();
        } else if (cmd.name == 'uidl') {
          var uids = getUids(session);
          
          console.log(uids)
          c.write('+OK\r\n');
          for (var i=0; i<uids.length; i++) {
            c.write((i+1) + ' ' + uids[i] + '\r\n')
          }
          c.write('.\r\n');
          round();
        } else if (cmd.name == 'quit') {
          var deletedList = [];
          for (var id in deleted) {
            deletedList.push(id);
          }
          
          db.deleteMessages(deletedList, function(err) {
            if (err) {
              c.write('-ERR Error deleting. Bye anyway.\r\n');
            } else {
              c.write('+OK Bye\r\n');
            }
            c.end();
          })
        } else if (cmd.name == 'retr') {
          var index = parseInt(cmd.data, 10);
          if (index < 1 || index > session.length) {
            c.write('-ERR No such message\r\n');
            round();
          } else {
            var id = session[index-1].id;
            console.log('will get message', id);
            db.getMessage(id, function(err, body) {
              if (err) {
                c.write('-ERR Internal error\r\n');
                round();
                return;
              }
              console.log('got body!');
              c.write('+OK ' + body.length + ' octets\r\n');
              c.write(body);
              c.write('.\r\n');
              round();
            });
          }
        } else if (cmd.name == 'dele') {
          var index = parseInt(cmd.data, 10);
          if (index < 1 || index > session.length) {
            c.write('-ERR No such message\r\n');
            round();
            return;
          }
          
          deleted[session[index-1].id] = true;
          c.write('+OK Deleted message ' + index + '\r\n');
          round();
        } else {
          console.log('unrecognized ' + cmd.name);
          c.write('-ERR Not recognized\r\n');
          round();
        }
      });
    }
    round();
    
    c.write('+OK POP3 server ready\r\n')
  });
};


module.exports = {
  createServer: createServer
}
