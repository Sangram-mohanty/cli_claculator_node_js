const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

test('health endpoint responds without a database connection', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('invalid resource IDs return a client error', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/trees/not-an-id/people`);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Tree ID must be a valid ID.' });
});
