const test = require('node:test');
const assert = require('node:assert/strict');
const { createsCycle } = require('../src/utils/relationshipGraph');

test('allows an ancestor relationship that does not create a cycle', () => {
  assert.equal(createsCycle([{ parentId: 'grandparent', childId: 'parent' }], 'parent', 'child'), false);
});

test('detects a direct reverse relationship', () => {
  assert.equal(createsCycle([{ parentId: 'parent', childId: 'child' }], 'child', 'parent'), true);
});

test('detects a cycle through multiple generations', () => {
  const relationships = [
    { parentId: 'a', childId: 'b' },
    { parentId: 'b', childId: 'c' }
  ];
  assert.equal(createsCycle(relationships, 'c', 'a'), true);
});

test('handles repeated edges without looping', () => {
  const relationships = [
    { parentId: 'a', childId: 'b' },
    { parentId: 'a', childId: 'b' }
  ];
  assert.equal(createsCycle(relationships, 'z', 'b'), false);
});
