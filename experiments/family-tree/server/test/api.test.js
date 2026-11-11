const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, rm, readdir } = require('node:fs/promises');

// Uploads go to a throwaway directory; must be set before the app is loaded.
let uploadDir;
let mongo;
let server;
let baseUrl;
let mongoose;
let adminToken = '';
const ADMIN_PASSWORD = 'test-admin-password';

test.before(async () => {
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'family-tree-uploads-'));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongoose = require('mongoose');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const app = require('../src/app');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  adminToken = (await api('POST', '/admin/login', { password: ADMIN_PASSWORD }, '')).body.token;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await rm(uploadDir, { recursive: true, force: true });
});

/** Calls the API; requests are made as the signed-in admin unless another token ('' for none) is given. */
async function api(method, url, body, token = adminToken) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function uploadPhoto(treeId, personId) {
  const form = new FormData();
  form.append('photo', new Blob([PNG], { type: 'image/png' }), 'photo.png');
  const response = await fetch(`${baseUrl}/trees/${treeId}/people/${personId}/photo`, { method: 'POST', body: form });
  return { status: response.status, body: await response.json() };
}

test('full family workflow: create, relate, edit, unlink, delete', async () => {
  const tree = await api('POST', '/trees', {
    name: 'Test Family', village: 'Bahadalapur', district: 'Kendrapara', state: 'Odisha', country: 'India', surname: 'Mohanty'
  });
  assert.equal(tree.status, 201);
  assert.deepEqual([tree.body.district, tree.body.state, tree.body.country], ['Kendrapara', 'Odisha', 'India']);
  const treeId = tree.body._id;

  const add = async (name, extra = {}) => (await api('POST', `/trees/${treeId}/people`, { name, ...extra })).body;
  const grandpa = await add('Grandpa', { birthYear: 1940, gender: 'Man' });
  const dad = await add('Dad');
  const aunt = await add('Aunt');
  const me = await add('Me');

  for (const [parentId, childId] of [[grandpa._id, dad._id], [grandpa._id, aunt._id], [dad._id, me._id]]) {
    assert.equal((await api('POST', `/trees/${treeId}/relationships`, { parentId, childId })).status, 201);
  }

  // Duplicate and cyclic links are rejected.
  assert.equal((await api('POST', `/trees/${treeId}/relationships`, { parentId: dad._id, childId: me._id })).status, 409);
  const cycle = await api('POST', `/trees/${treeId}/relationships`, { parentId: me._id, childId: grandpa._id });
  assert.equal(cycle.status, 400);

  const links = (await api('GET', `/trees/${treeId}/relationships`)).body;
  assert.equal(links.length, 3);
  assert.ok(links.some((link) => link.parentId === dad._id && link.childId === me._id));

  let relatives = (await api('GET', `/trees/${treeId}/people/${dad._id}/relatives`)).body;
  assert.deepEqual(relatives.parents.map((p) => p.name), ['Grandpa']);
  assert.deepEqual(relatives.siblings.map((p) => p.name), ['Aunt']);
  assert.deepEqual(relatives.children.map((p) => p.name), ['Me']);

  // Edit a person, including clearing an optional field.
  const edited = await api('PATCH', `/trees/${treeId}/people/${grandpa._id}`, { name: 'Grandfather', gender: '', birthYear: null });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, 'Grandfather');
  assert.equal(edited.body.birthYear, undefined);
  assert.equal((await api('PATCH', `/trees/${treeId}/people/${grandpa._id}`, { name: '' })).status, 400);

  // Unlink Aunt from Grandfather: she is no longer Dad's sibling.
  assert.equal((await api('DELETE', `/trees/${treeId}/relationships/${grandpa._id}/${aunt._id}`)).status, 204);
  assert.equal((await api('DELETE', `/trees/${treeId}/relationships/${grandpa._id}/${aunt._id}`)).status, 404);
  relatives = (await api('GET', `/trees/${treeId}/people/${dad._id}/relatives`)).body;
  assert.deepEqual(relatives.siblings, []);

  // Deleting Dad removes his links and his photo file.
  assert.equal((await uploadPhoto(treeId, dad._id)).status, 200);
  assert.equal((await readdir(uploadDir)).length, 1);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${dad._id}`)).status, 204);
  assert.equal((await readdir(uploadDir)).length, 0);
  relatives = (await api('GET', `/trees/${treeId}/people/${me._id}/relatives`)).body;
  assert.deepEqual(relatives.parents, []);
  assert.equal((await api('GET', `/trees/${treeId}/people/${dad._id}/relatives`)).status, 404);

  const people = (await api('GET', `/trees/${treeId}/people`)).body;
  assert.deepEqual(people.map((p) => p.name), ['Aunt', 'Grandfather', 'Me']);
});

test('marriages: add, list, show as spouses, validate, and remove', async () => {
  const treeId = (await api('POST', '/trees', { name: 'Wed', village: 'V', surname: 'S' })).body._id;
  const add = async (name, gender) => (await api('POST', `/trees/${treeId}/people`, { name, gender })).body;
  const husband = await add('Husband', 'Man');
  const wife = await add('Wife', 'Woman');
  const son = await add('Son', 'Man');

  const married = await api('POST', `/trees/${treeId}/partnerships`, { personId: husband._id, partnerId: wife._id });
  assert.equal(married.status, 201);
  // The same couple in the other order is a duplicate.
  assert.equal((await api('POST', `/trees/${treeId}/partnerships`, { personId: wife._id, partnerId: husband._id })).status, 409);
  assert.equal((await api('POST', `/trees/${treeId}/partnerships`, { personId: wife._id, partnerId: wife._id })).status, 400);

  const list = (await api('GET', `/trees/${treeId}/partnerships`)).body;
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].personA, list[0].personB].sort(), [husband._id, wife._id].sort());

  assert.deepEqual((await api('GET', `/trees/${treeId}/people/${husband._id}/relatives`)).body.spouses.map((p) => p.name), ['Wife']);
  assert.deepEqual((await api('GET', `/trees/${treeId}/people/${wife._id}/relatives`)).body.spouses.map((p) => p.name), ['Husband']);

  // Spouses cannot be linked as parent and child, and a parent cannot marry their child.
  assert.equal((await api('POST', `/trees/${treeId}/relationships`, { parentId: husband._id, childId: wife._id })).status, 400);
  await api('POST', `/trees/${treeId}/relationships`, { parentId: husband._id, childId: son._id });
  assert.equal((await api('POST', `/trees/${treeId}/partnerships`, { personId: son._id, partnerId: husband._id })).status, 400);

  // Removing works in either order; deleting a person removes their marriages.
  assert.equal((await api('DELETE', `/trees/${treeId}/partnerships/${wife._id}/${husband._id}`)).status, 204);
  assert.equal((await api('DELETE', `/trees/${treeId}/partnerships/${wife._id}/${husband._id}`)).status, 404);
  await api('POST', `/trees/${treeId}/partnerships`, { personId: husband._id, partnerId: wife._id });
  await api('DELETE', `/trees/${treeId}/people/${wife._id}`);
  assert.deepEqual((await api('GET', `/trees/${treeId}/partnerships`)).body, []);
});

test('replacing a photo removes the old file', async () => {
  const treeId = (await api('POST', '/trees', { name: 'Photo Family', village: 'V', surname: 'S' })).body._id;
  const person = (await api('POST', `/trees/${treeId}/people`, { name: 'Pic' })).body;
  const before = new Set(await readdir(uploadDir));
  await uploadPhoto(treeId, person._id);
  const second = await uploadPhoto(treeId, person._id);
  const after = (await readdir(uploadDir)).filter((file) => !before.has(file));
  assert.equal(after.length, 1);
  assert.equal(second.body.person.photoUrl, `/uploads/${after[0]}`);

  // Removing the photo clears it and deletes the file.
  const removed = await api('DELETE', `/trees/${treeId}/people/${person._id}/photo`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.person.photoUrl, '');
  assert.deepEqual((await readdir(uploadDir)).filter((file) => !before.has(file)), []);
});

test('people from another tree cannot be edited or linked', async () => {
  const treeA = (await api('POST', '/trees', { name: 'A', village: 'V', surname: 'S' })).body._id;
  const treeB = (await api('POST', '/trees', { name: 'B', village: 'V', surname: 'S' })).body._id;
  const a = (await api('POST', `/trees/${treeA}/people`, { name: 'A1' })).body;
  const b = (await api('POST', `/trees/${treeB}/people`, { name: 'B1' })).body;

  assert.equal((await api('PATCH', `/trees/${treeB}/people/${a._id}`, { name: 'X' })).status, 404);
  assert.equal((await api('DELETE', `/trees/${treeB}/people/${a._id}`)).status, 404);
  assert.equal((await api('POST', `/trees/${treeA}/relationships`, { parentId: a._id, childId: b._id })).status, 400);
});

test('deleting a tree removes its people and relationships', async () => {
  const treeId = (await api('POST', '/trees', { name: 'Gone', village: 'V', surname: 'S' })).body._id;
  const p = (await api('POST', `/trees/${treeId}/people`, { name: 'P' })).body;
  const c = (await api('POST', `/trees/${treeId}/people`, { name: 'C' })).body;
  await api('POST', `/trees/${treeId}/relationships`, { parentId: p._id, childId: c._id });

  assert.equal((await api('DELETE', `/trees/${treeId}`)).status, 204);
  assert.equal((await api('GET', `/trees/${treeId}/people`)).status, 404);
  const Person = require('../src/models/Person');
  const Relationship = require('../src/models/Relationship');
  assert.equal(await Person.countDocuments({ treeId }), 0);
  assert.equal(await Relationship.countDocuments({ treeId }), 0);
});

test('only a signed-in admin can delete people, or rename or delete trees', async () => {
  const treeId = (await api('POST', '/trees', { name: 'Guarded', village: 'V', surname: 'S' })).body._id;
  const person = (await api('POST', `/trees/${treeId}/people`, { name: 'Keep me' }, '')).body;

  // Not signed in, or a forged/garbled token: refused, and the person is still there.
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${person._id}`, undefined, '')).status, 401);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${person._id}`, undefined, 'abc.def')).status, 401);
  const forged = adminToken.split('.')[0] + '.' + 'x'.repeat(43);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${person._id}`, undefined, forged)).status, 401);
  assert.equal((await api('DELETE', `/trees/${treeId}`, undefined, '')).status, 401);
  assert.equal((await api('GET', `/trees/${treeId}/people`)).body.length, 1);

  // Everyone else can still add and edit.
  assert.equal((await api('PATCH', `/trees/${treeId}/people/${person._id}`, { name: 'Edited' }, '')).status, 200);

  // Wrong password is rejected; session reports admin status.
  assert.equal((await api('POST', '/admin/login', { password: 'wrong' }, '')).status, 401);
  assert.deepEqual((await api('GET', '/admin/session', undefined, '')).body.admin, false);
  assert.deepEqual((await api('GET', '/admin/session')).body.admin, true);

  // Only the admin can rename a family.
  assert.equal((await api('PATCH', `/trees/${treeId}`, { name: 'Renamed' }, '')).status, 401);
  const renamed = await api('PATCH', `/trees/${treeId}`, { name: 'Renamed', village: 'New Village', surname: 'New', state: 'Odisha', country: 'India' });
  assert.deepEqual([renamed.body.state, renamed.body.country], ['Odisha', 'India']);
  assert.equal(renamed.status, 200);
  assert.deepEqual([renamed.body.name, renamed.body.village, renamed.body.surname], ['Renamed', 'New Village', 'New']);
  assert.equal((await api('PATCH', `/trees/${treeId}`, { name: '' })).status, 400);

  // The admin can delete.
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${person._id}`)).status, 204);
  assert.equal((await api('DELETE', `/trees/${treeId}`)).status, 204);
});

test('admin tokens expire and are tied to the signing secret', () => {
  const { issueToken, verifyToken } = require('../src/auth/admin');
  const { token } = issueToken(Date.now() - 13 * 60 * 60 * 1000);
  assert.equal(verifyToken(token), null);
  assert.ok(verifyToken(issueToken().token));
});
