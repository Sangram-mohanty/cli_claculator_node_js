// Saves every collection in the family tree database to JSON files.
// Usage: npm run backup            -> server/backups/<date-time>/
//        npm run backup -- <folder> -> that folder
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { EJSON } = mongoose.mongo.BSON;

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_tree';

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'backups', stamp));
  fs.mkdirSync(target, { recursive: true });

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const summary = {};
  for (const { name } of collections) {
    const documents = await db.collection(name).find().toArray();
    // Extended JSON keeps ObjectIds and dates exact, so a restore is identical.
    fs.writeFileSync(path.join(target, `${name}.json`), EJSON.stringify(documents, null, 2, { relaxed: false }));
    summary[name] = documents.length;
  }
  fs.writeFileSync(path.join(target, 'summary.json'), JSON.stringify({ createdAt: new Date().toISOString(), database: db.databaseName, counts: summary }, null, 2));
  await mongoose.disconnect();
  console.log(`Backup saved to ${target}`);
  console.log(summary);
}

main().catch(async (error) => {
  console.error('Backup failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
