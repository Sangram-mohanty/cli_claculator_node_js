// Loads a backup made by scripts/backup.js into the database.
// Usage: npm run restore -- <backup folder> [--replace]
// Without --replace it refuses to touch a database that already has family data.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { EJSON } = mongoose.mongo.BSON;

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_tree';

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const folder = args.find((arg) => !arg.startsWith('--'));
  if (!folder) throw new Error('Give the backup folder, e.g. npm run restore -- backups/2026-11-11_10-06-24');
  const source = path.resolve(folder);
  const files = fs.readdirSync(source).filter((file) => file.endsWith('.json') && file !== 'summary.json');
  if (!files.length) throw new Error(`No backup files found in ${source}`);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const existing = await db.collection('people').countDocuments().catch(() => 0);
  if (existing && !replace) {
    throw new Error(`The database already has ${existing} people. Add --replace to overwrite it with the backup.`);
  }

  const restored = {};
  for (const file of files) {
    const name = path.basename(file, '.json');
    const documents = EJSON.parse(fs.readFileSync(path.join(source, file), 'utf8'), { relaxed: false });
    await db.collection(name).deleteMany({});
    if (documents.length) await db.collection(name).insertMany(documents);
    restored[name] = documents.length;
  }
  await mongoose.disconnect();
  console.log(`Restored from ${source}`);
  console.log(restored);
}

main().catch(async (error) => {
  console.error('Restore failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
