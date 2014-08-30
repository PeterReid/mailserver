var smtp = require('smtp-protocol');
var Pop3 = require('./pop3server');
var MailDb = require('./db');
var dns = require('dns');
var fs = require('fs')
var db = new MailDb('mail.db');

db.on('ready', startServers);

var myDomain = 'peterreid.net';
var outgoingSmtp = 'mail.twc.com';

function isLocalEmail(email) {
  return getDomain(email)==myDomain;
}

function getDomain(email) {
  var m = email.match(/^([^@]+)@([^@]+)$/)
  if (!m) return false;
  
  return m[2].toLowerCase();
}

function sendMail(from, to, message) {
  console.log('sending!');
  smtp.connect(outgoingSmtp, 25, function (mail) {
    mail.helo(myDomain);
    mail.from(from);
    mail.to(to);
    mail.data();
    
    var m = mail.message();
    m.write(''+message);
    m.end();
    mail.quit();
  });
}


function startServers() {
  console.log('Starting servers')
  
  var server = smtp.createServer(function (req) {
      console.log('got request')
      req.on('to', function (to, ack) {
          ack.accept();
      });

      req.on('message', function (stream, ack) {
          console.log('from: ' + req.from);
          console.log('to: ' + req.to);
          var from = ''+req.from;
          var to = ''+req.to;

          var body = '';
          stream.on('data', function(d) {
            body += d.toString();
          });
          stream.on('end', function() {
            if (isLocalEmail(to)) {
              db.storeMessage(to, body, function(err) {
                console.log('storeMessage result:', err);
              });
            } else if (isLocalEmail(from)) {
              console.log('I need to send this to someone...');
              var toDomain = getDomain(to);
              if (!toDomain) {
                console.log('I do not know what the domain is!');
              }
              console.log('I need to send this to ' + toDomain + '!');
              
              sendMail(from, to, body);
              /*dns.resolveMx(toDomain, function(err, res) {
                console.log(err, res);
                
              });*/
            }
          });
          stream.pipe(process.stdout, { end : false });
          ack.accept();
      });
      
      //req.socket.on('data', function(data) {
        //console.log(data.toString())
      //})
  });

  server.listen(25);

  Pop3.createServer(db).listen(110);
}