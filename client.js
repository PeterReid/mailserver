var smtp = require('smtp-protocol');
var fs = require('fs');

smtp.connect('mail.twc.com', 587, function (mail) {
  console.log('connected');
  mail.helo('peterreid.net', function() {
    console.log('start tls')
    mail.startTLS(function(err) {
    });
    mail.on('tls', function() {
      process.nextTick(function() {
        console.log('tlsed!');
        mail.from('peter@peterreid.net', function() {
          console.log('responded to FROM');
          mail.to('peter@flightvector.com', function() {
            console.log('responded to TO');
            mail.data(function() {
              console.log('responded to DATA');
              var f = fs.createReadStream('./message-to-fv.txt');
              f.pipe(mail.message());
              f.on('end', function() {
                  console.log('quitting')
                  mail.quit(function() {
                    console.log('quit done')
                  });
                  mail.stream.end();
              });
            });
          });
        })
      });
    });
  });
});
