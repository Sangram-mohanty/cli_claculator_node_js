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
let userToken = '';
let adminToken = '';

test.before(async () => {
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'family-tree-uploads-'));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.AUTH_TOKEN_SECRET = 'test-account-token-secret';
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  process.env.ADMIN_TOKEN_SECRET = 'test-admin-token-secret';
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongoose = require('mongoose');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await require('../src/utils/seedDemo').seedDemoFamily();
  const app = require('../src/app');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  userToken = (await api('POST', '/auth/signup', { email: 'historian@example.test', password: 'a-private-passphrase' }, '')).body.token;
  adminToken = (await api('POST', '/admin/login', { password: process.env.ADMIN_PASSWORD }, '')).body.token;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await rm(uploadDir, { recursive: true, force: true });
});

/** Calls the API as the signed-in test user unless another token ('' for none) is given. */
async function api(method, url, body, token = userToken, adminAuthToken = '') {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (adminAuthToken) headers['X-Admin-Token'] = adminAuthToken;
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
  const response = await fetch(`${baseUrl}/trees/${treeId}/people/${personId}/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: form
  });
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
  const unlinkPath = `/trees/${treeId}/relationships/${grandpa._id}/${aunt._id}`;
  assert.equal((await api('DELETE', unlinkPath)).status, 401);
  assert.equal((await api('DELETE', unlinkPath, undefined, '', adminToken)).status, 204);
  assert.equal((await api('DELETE', unlinkPath, undefined, '', adminToken)).status, 404);
  relatives = (await api('GET', `/trees/${treeId}/people/${dad._id}/relatives`)).body;
  assert.deepEqual(relatives.siblings, []);

  // Deleting Dad removes his links and his photo file.
  assert.equal((await uploadPhoto(treeId, dad._id)).status, 200);
  assert.equal((await readdir(uploadDir)).length, 1);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${dad._id}`, undefined, userToken, adminToken)).status, 204);
  assert.equal((await readdir(uploadDir)).length, 0);
  relatives = (await api('GET', `/trees/${treeId}/people/${me._id}/relatives`)).body;
  assert.deepEqual(relatives.parents, []);
  assert.equal((await api('GET', `/trees/${treeId}/people/${dad._id}/relatives`)).status, 404);

  const people = (await api('GET', `/trees/${treeId}/people`)).body;
  assert.deepEqual(people.map((p) => p.name), ['Aunt', 'Grandfather', 'Me']);
});

test('only admin can delete family members', async () => {
  const treeId = (await api('POST', '/trees', { name: 'Admin Delete', village: 'V', surname: 'S' })).body._id;
  const person = (await api('POST', `/trees/${treeId}/people`, { name: 'Protected Person' })).body;
  const deletePath = `/trees/${treeId}/people/${person._id}`;

  assert.equal((await api('DELETE', deletePath, undefined, '')).status, 401);
  assert.equal((await api('DELETE', deletePath)).status, 401);
  assert.equal((await api('POST', '/admin/login', { password: 'wrong-password' }, '')).status, 401);
  const session = await api('GET', '/admin/session', undefined, '', adminToken);
  assert.equal(session.body.configured, true);
  assert.equal(session.body.admin, true);
  assert.ok(Date.parse(session.body.expiresAt) > Date.now());
  assert.equal((await api('DELETE', deletePath, undefined, '', adminToken)).status, 204);
});

test('only admin can delete family trees, people, photos, and connections', async () => {
  const treeId = (await api('POST', '/trees', { name: 'Protected Family', village: 'V', surname: 'S' })).body._id;
  const parent = (await api('POST', `/trees/${treeId}/people`, { name: 'Parent' })).body;
  const child = (await api('POST', `/trees/${treeId}/people`, { name: 'Child' })).body;
  const spouse = (await api('POST', `/trees/${treeId}/people`, { name: 'Spouse' })).body;
  await api('POST', `/trees/${treeId}/relationships`, { parentId: parent._id, childId: child._id });
  await api('POST', `/trees/${treeId}/partnerships`, { personId: child._id, partnerId: spouse._id });
  await uploadPhoto(treeId, spouse._id);

  assert.equal((await api('DELETE', `/trees/${treeId}`)).status, 401);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${parent._id}`)).status, 401);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${spouse._id}/photo`)).status, 401);
  assert.equal((await api('DELETE', `/trees/${treeId}/relationships/${parent._id}/${child._id}`)).status, 401);
  assert.equal((await api('DELETE', `/trees/${treeId}/partnerships/${child._id}/${spouse._id}`)).status, 401);

  assert.equal((await api('DELETE', `/trees/${treeId}/partnerships/${child._id}/${spouse._id}`, undefined, '', adminToken)).status, 204);
  assert.equal((await api('DELETE', `/trees/${treeId}/relationships/${parent._id}/${child._id}`, undefined, '', adminToken)).status, 204);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${spouse._id}/photo`, undefined, '', adminToken)).status, 200);
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${parent._id}`, undefined, '', adminToken)).status, 204);
  assert.equal((await api('DELETE', `/trees/${treeId}`, undefined, '', adminToken)).status, 204);
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
  const unlinkPath = `/trees/${treeId}/partnerships/${wife._id}/${husband._id}`;
  assert.equal((await api('DELETE', unlinkPath)).status, 401);
  assert.equal((await api('DELETE', unlinkPath, undefined, '', adminToken)).status, 204);
  assert.equal((await api('DELETE', unlinkPath, undefined, '', adminToken)).status, 404);
  await api('POST', `/trees/${treeId}/partnerships`, { personId: husband._id, partnerId: wife._id });
  assert.equal((await api('DELETE', `/trees/${treeId}/people/${wife._id}`, undefined, userToken, adminToken)).status, 204);
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
  const signedUrl = new URL(second.body.person.photoUrl, 'http://localhost');
  assert.equal(signedUrl.pathname, `/uploads/${after[0]}`);
  assert.ok(signedUrl.searchParams.has('signature'));
  const origin = new URL(baseUrl).origin;
  assert.equal((await fetch(`${origin}${signedUrl.pathname}`)).status, 403);
  assert.equal((await fetch(new URL(second.body.person.photoUrl, origin))).status, 200);

  // Removing the photo clears it and deletes the file.
  const removed = await api('DELETE', `/trees/${treeId}/people/${person._id}/photo`, undefined, '', adminToken);
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
  assert.equal((await api('DELETE', `/trees/${treeB}/people/${a._id}`)).status, 401);
  assert.equal((await api('POST', `/trees/${treeA}/relationships`, { parentId: a._id, childId: b._id })).status, 400);
});

test('deleting a tree removes its people and relationships', async () => {
  const treeId = (await api('POST', '/trees', { name: 'Gone', village: 'V', surname: 'S' })).body._id;
  const p = (await api('POST', `/trees/${treeId}/people`, { name: 'P' })).body;
  const c = (await api('POST', `/trees/${treeId}/people`, { name: 'C' })).body;
  await api('POST', `/trees/${treeId}/relationships`, { parentId: p._id, childId: c._id });

  assert.equal((await api('DELETE', `/trees/${treeId}`)).status, 401);
  assert.equal((await api('DELETE', `/trees/${treeId}`, undefined, '', adminToken)).status, 204);
  assert.equal((await api('GET', `/trees/${treeId}/people`)).status, 404);
  const Person = require('../src/models/Person');
  const Relationship = require('../src/models/Relationship');
  assert.equal(await Person.countDocuments({ treeId }), 0);
  assert.equal(await Relationship.countDocuments({ treeId }), 0);
});

test('accounts keep private trees isolated and leave pre-account trees unassigned', async () => {
  const privateTree = await api('POST', '/trees', { name: 'Private', village: 'V', surname: 'S' });
  assert.equal(privateTree.status, 201);
  const legacyTree = await require('../src/models/FamilyTree').create({
    name: 'Unassigned',
    village: 'V',
    surname: 'Legacy'
  });
  const otherAccount = await api('POST', '/auth/signup', {
    email: 'another@example.test',
    password: 'another-private-passphrase'
  }, '');
  assert.equal(otherAccount.status, 201);
  const otherToken = otherAccount.body.token;

  const publicTrees = await api('GET', '/trees', undefined, '');
  assert.equal(publicTrees.status, 200);
  assert.deepEqual(publicTrees.body.map((tree) => tree.isDemo), [true]);
  const ownTrees = await api('GET', '/trees');
  assert.ok(ownTrees.body.some((tree) => tree._id === privateTree.body._id));
  assert.ok(!ownTrees.body.some((tree) => tree.isDemo));
  assert.ok(!ownTrees.body.some((tree) => tree._id === legacyTree.id));
  assert.equal((await api('GET', `/trees/${privateTree.body._id}/people`, undefined, otherToken)).status, 404);
  assert.equal((await api('GET', `/trees/${legacyTree.id}/people`)).status, 404);
  assert.equal((await api('POST', '/trees', { name: 'No auth', village: 'V', surname: 'S' }, '')).status, 401);
  assert.equal((await api('PATCH', `/trees/${privateTree.body._id}`, { name: 'Intrusion' }, otherToken)).status, 404);

  const renamed = await api('PATCH', `/trees/${privateTree.body._id}`, { name: 'Renamed' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, 'Renamed');
});

test('admin can read every family while regular accounts see only their own', async () => {
  const firstTree = (await api('POST', '/trees', { name: 'First Family', village: 'V', surname: 'First' })).body;
  const secondAccount = await api('POST', '/auth/signup', {
    email: 'family-owner@example.test',
    password: 'another-private-passphrase'
  }, '');
  const secondTree = await api('POST', '/trees', { name: 'Second Family', village: 'V', surname: 'Second' }, secondAccount.body.token);
  const firstOwnerTrees = await api('GET', '/trees', undefined, userToken);
  const adminTrees = await api('GET', '/trees', undefined, '', adminToken);

  assert.ok(firstOwnerTrees.body.some((tree) => tree._id === firstTree._id));
  assert.ok(!firstOwnerTrees.body.some((tree) => tree._id === secondTree.body._id));
  assert.ok(!firstOwnerTrees.body.some((tree) => tree.isDemo));
  assert.ok(adminTrees.body.some((tree) => tree._id === firstTree._id));
  assert.ok(adminTrees.body.some((tree) => tree._id === secondTree.body._id));
  assert.ok(adminTrees.body.some((tree) => tree.isDemo));
  assert.equal((await api('GET', `/trees/${secondTree.body._id}/people`, undefined, '', adminToken)).status, 200);
});

test('the public showcase is readable but cannot be changed', async () => {
  await require('../src/utils/seedDemo').seedDemoFamily();
  const trees = await api('GET', '/trees', undefined, '');
  assert.equal(trees.status, 200);
  const demo = trees.body.find((tree) => tree.isDemo);
  assert.ok(demo);

  const people = await api('GET', `/trees/${demo._id}/people`, undefined, '');
  const links = await api('GET', `/trees/${demo._id}/relationships`, undefined, '');
  const partnerships = await api('GET', `/trees/${demo._id}/partnerships`, undefined, '');
  assert.equal(people.body.length, 20);
  assert.equal(new Set(people.body.map((person) => person.name)).size, 20);
  assert.equal(links.body.length, 36);
  assert.equal(partnerships.body.length, 10);
  const children = new Set(links.body.map((link) => link.childId));
  const generations = new Map(people.body.filter((person) => !children.has(person._id)).map((person) => [person._id, 1]));
  for (let depth = 1; depth <= people.body.length; depth += 1) {
    for (const link of links.body) {
      if (generations.get(link.parentId) === depth) generations.set(link.childId, depth + 1);
    }
  }
  assert.equal(Math.max(...generations.values()), 5);
  assert.equal((await api('POST', `/trees/${demo._id}/people`, { name: 'Unauthorized' }, '')).status, 401);
  assert.equal((await api('POST', `/trees/${demo._id}/people`, { name: 'Unauthorized' })).status, 403);
});

test('sign-up validates credentials, and session tokens expire', async () => {
  assert.equal((await api('POST', '/auth/signup', { email: 'bad', password: 'long-enough-password' }, '')).status, 400);
  assert.equal((await api('POST', '/auth/signup', { email: 'short@example.test', password: 'short' }, '')).status, 400);
  assert.equal((await api('POST', '/auth/signup', {
    email: 'historian@example.test',
    password: 'a-private-passphrase'
  }, '')).status, 409);
  assert.equal((await api('POST', '/auth/login', {
    email: 'historian@example.test',
    password: 'incorrect-passphrase'
  }, '')).status, 401);
  assert.equal((await api('GET', '/auth/session')).body.user.email, 'historian@example.test');
  const { issueToken, verifyToken } = require('../src/auth/accounts');
  const { token } = issueToken({ _id: '507f1f77bcf86cd799439011' }, Date.now() - 8 * 24 * 60 * 60 * 1000);
  assert.equal(verifyToken(token), null);
  assert.ok(verifyToken(issueToken({ _id: '507f1f77bcf86cd799439011' }).token));
});
