function createsCycle(relationships, parentId, childId) {
  const childrenByParent = new Map();
  for (const relationship of relationships) {
    const children = childrenByParent.get(String(relationship.parentId)) ?? [];
    children.push(String(relationship.childId));
    childrenByParent.set(String(relationship.parentId), children);
  }

  const target = String(parentId);
  const pending = [String(childId)];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(childrenByParent.get(current) ?? []));
  }
  return false;
}

module.exports = { createsCycle };
