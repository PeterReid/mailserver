var MailDb = require('./db');

var mdb = new MailDb('mail.db');

var username = process.argv[2];
var password = process.argv[3];

if (username && password) {
  
} else {
  console.log('Usage: node create-user.js <username> <password>')
  return;
}

mdb.on('ready', function() {
  mdb.createUser(username, password, function(err) {
    if (err) console.log(err);
  });
});
