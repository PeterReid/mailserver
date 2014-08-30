var smtp = require('smtp-protocol');
var fs = require('fs');

smtp.connect('mail.twc.com', 25, function (mail) {
    console.log('connected');
    mail.helo('peterreid.net');
    mail.from('peter@peterreid.net');
    mail.to('peter@flightvector.com');
    mail.data();
    var f = fs.createReadStream('./message-to-fv.txt');
    f.pipe(mail.message());
    f.on('end', function() {
        mail.quit();
    });
});
