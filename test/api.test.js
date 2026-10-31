const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');

test('GET / returns API info', async () => {
  const response = await request(app).get('/');

  assert.equal(response.statusCode, 200);
  assert.match(response.body.message, /Calculator API/i);
});

test('POST /calculate adds two numbers', async () => {
  const response = await request(app)
    .post('/calculate')
    .send({ operation: 'add', numbers: [5, 3] });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result, 8);
});

test('POST /calculate divides numbers', async () => {
  const response = await request(app)
    .post('/calculate')
    .send({ operation: 'divide', numbers: [10, 2] });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result, 5);
});
