// Runs a local MongoDB for development without installing MongoDB, keeping the data permanently in
// server/data/db (git-ignored). Usage: npm run db   (leave it running; Ctrl+C stops it safely)
// If you install MongoDB yourself, or use MongoDB Atlas, you do not need this script.
const fs = require('node:fs');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const dbPath = path.resolve(__dirname, '..', 'data', 'db');
const port = Number(process.env.LOCAL_DB_PORT || 27017);

async function main() {
  fs.mkdirSync(dbPath, { recursive: true });
  const mongo = await MongoMemoryServer.create({
    instance: { port, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' }
  });
  console.log(`MongoDB is running at mongodb://127.0.0.1:${port}/  (data saved in ${dbPath})`);
  console.log('Leave this window open. Press Ctrl+C to stop the database safely.');

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    // doCleanup: false keeps the data files; they are the family tree.
    await mongo.stop({ doCleanup: false, force: false });
    console.log('MongoDB stopped. Your data is saved.');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error('Could not start the local database:', error.message);
  process.exitCode = 1;
});
