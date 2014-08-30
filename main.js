var smtp = require('smtp-protocol');
var Pop3 = require('./pop3server');
var MailDb = require('./db');
var dns = require('dns');
var fs = require('fs')
var db = new MailDb('mail.db');
var tls = require('tls');
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
  smtp.connect(outgoingSmtp, 587, function (mail) {
    mail.helo(myDomain, function() {
      mail.startTLS(function(err) {
      });
      mail.on('tls', function() {
        process.nextTick(function() {
          mail.from(from, function() {
            mail.to(to, function() {
              mail.data(function() {
                var m = mail.message();
                m.write(message)
                m.end();
                mail.quit(function() {
                  console.log('quit done')
                  mail.stream.end();
                });
              });
            });
          })
        });
      });
    });
  });
}

function startServers() {
  console.log('Starting servers')
  
  var cert = fs.readFileSync('C:\\Misc\\cert\\peterreid.net\\2014\\mail.peterreid.net.crt.all');
  var key = fs.readFileSync('C:\\Misc\\cert\\peterreid.net\\2014\\mail.peterreid.net.key');
  
  function handleSmtpRequest(req) {
    console.log('got request')
    req.on('from', function (from, ack) {
        console.log('got from', from, ack)
        ack.accept(250, 'ok');
    });
    req.on('to', function (to, ack) {
        ack.accept(250, 'ok');
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
          console.log('stream finished!');
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
        ack.accept(354, 'ok');
    });
  }
  
  var opts = {domain:'peterreid.net', cert:cert, key:key};
  
  //var smtpsServer = smtp.createTlsServer(opts, handleSmtpRequest);
  //smtpsServer.listen(465);

  
  smtp.createServer(opts, handleSmtpRequest).listen(25);
  smtp.createServer(opts, handleSmtpRequest).listen(587);
  //smtpServer.listen(587);
  //smtpServer;
  
  Pop3.createServer({cert:cert, key:key}, db).listen(995);
  
  
}