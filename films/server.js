const app = require('./app');
const { DB_URI } = require('./src/config');
const mongoose = require('mongoose');

const port = process.env.PORT || 3000;

async function start() {
  await mongoose.connect(DB_URI);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, function() {
      console.log('Films API listening on port ' + port);
      resolve(server);
    });
    server.once('error', reject);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Films API could not start:', error.message);
    process.exit(1);
  });
}

module.exports = { start };
