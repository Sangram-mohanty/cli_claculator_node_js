require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { seedDemoFamily } = require('./utils/seedDemo');

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_tree';

async function start() {
  await mongoose.connect(mongoUri);
  await seedDemoFamily();
  app.listen(port, () => {
    console.log(`Family tree API listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Could not start the family tree API:', error);
  process.exitCode = 1;
});
