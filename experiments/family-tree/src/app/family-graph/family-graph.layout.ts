export interface GraphPerson {
  _id: string;
  name: string;
  gender?: string;
  birthYear?: number;
  photoUrl?: string;
}

export interface GraphLink {
  parentId: string;
  childId: string;
}

/** A marriage between two people. */
export interface GraphPartners {
  personA: string;
  personB: string;
}

export interface GraphNode {
  person: GraphPerson;
  generation: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  d: string;
  /** couple: marriage line between partners; couple-drop: from a marriage down to the children;
   *  descent: bloodline bar and lines into each child. */
  kind: 'couple' | 'couple-drop' | 'descent';
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  generations: number;
}

/** Each person is a round portrait with their name underneath. */
export const NODE_WIDTH = 132;
export const NODE_HEIGHT = 158;
export const PHOTO_SIZE = 84;
/** Distance from the top of a node to the centre of its portrait. */
export const PHOTO_CENTER_Y = PHOTO_SIZE / 2 + 10;
const COUPLE_GAP = 14;
const BLOCK_GAP = 44;
const ROW_GAP = 52;
const PADDING = 36;

/**
 * Lays out a family as rows of generations. Partners (people who share a child)
 * sit side by side, and each family's children are placed beneath their parents.
 */
export function layoutFamilyGraph(people: GraphPerson[], links: GraphLink[], partners: GraphPartners[] = []): GraphLayout {
  const byId = new Map(people.map((person) => [person._id, person]));
  const validLinks = links.filter((link) => byId.has(link.parentId) && byId.has(link.childId));
  const couples: [string, string][] = partners
    .filter((pair) => byId.has(pair.personA) && byId.has(pair.personB) && pair.personA !== pair.personB)
    .map((pair) => [pair.personA, pair.personB]);
  if (!people.length) return { nodes: [], edges: [], width: 0, height: 0, generations: 0 };

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const id of byId.keys()) {
    parentsOf.set(id, []);
    childrenOf.set(id, []);
  }
  for (const { parentId, childId } of validLinks) {
    if (!parentsOf.get(childId)!.includes(parentId)) parentsOf.get(childId)!.push(parentId);
    if (!childrenOf.get(parentId)!.includes(childId)) childrenOf.get(parentId)!.push(childId);
  }

  const generation = assignGenerations([...byId.keys()], parentsOf, couples);
  const rows = orderRows(byId, generation, parentsOf, childrenOf, couples);
  const position = placeRows(rows, parentsOf, childrenOf);

  const rowY = (gen: number) => PADDING + gen * (NODE_HEIGHT + ROW_GAP);
  const nodes: GraphNode[] = [];
  let maxRight = 0;
  for (const [gen, blocks] of rows.entries()) {
    for (const block of blocks) {
      for (const id of block) {
        const x = position.get(id)!;
        maxRight = Math.max(maxRight, x + NODE_WIDTH);
        nodes.push({ person: byId.get(id)!, generation: gen, x, y: rowY(gen) });
      }
    }
  }

  const edges = buildEdges(rows, position, parentsOf, generation, rowY, couples);
  return {
    nodes,
    edges,
    width: maxRight + PADDING,
    height: rowY(rows.length - 1) + NODE_HEIGHT + PADDING,
    generations: rows.length
  };
}

/**
 * Assigns each person a row:
 * - children sit below all of their parents;
 * - partners and spouses share a row;
 * - parents sit directly above their lowest child, so when someone marries into a family that is
 *   drawn further down, their parents and brothers and sisters move down with them instead of the
 *   line stretching across several rows.
 */
export function assignGenerations(
  ids: string[],
  parentsOf: Map<string, string[]>,
  couples: [string, string][] = []
): Map<string, number> {
  const generation = new Map(ids.map((id) => [id, 0]));
  const childrenOf = new Map<string, string[]>();
  for (const [childId, parents] of parentsOf) {
    for (const parentId of parents) childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), childId]);
  }
  const maxIterations = ids.length * 4 + 4;
  for (let i = 0; i < maxIterations; i++) {
    let changed = false;
    for (const id of ids) {
      const parents = parentsOf.get(id) ?? [];
      if (!parents.length) continue;
      const parentGen = Math.max(...parents.map((parentId) => generation.get(parentId)!));
      for (const parentId of parents) {
        if (generation.get(parentId)! < parentGen) {
          generation.set(parentId, parentGen);
          changed = true;
        }
      }
      if (generation.get(id)! < parentGen + 1) {
        generation.set(id, parentGen + 1);
        changed = true;
      }
    }
    for (const [a, b] of couples) {
      const shared = Math.max(generation.get(a)!, generation.get(b)!);
      if (generation.get(a)! !== shared || generation.get(b)! !== shared) {
        generation.set(a, shared);
        generation.set(b, shared);
        changed = true;
      }
    }
    for (const [parentId, children] of childrenOf) {
      const lowestChild = Math.max(...children.map((childId) => generation.get(childId)!));
      if (generation.get(parentId)! < lowestChild - 1) {
        generation.set(parentId, lowestChild - 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Close gaps so rows are numbered 0..n-1 without empty generations.
  const used = [...new Set(generation.values())].sort((a, b) => a - b);
  const compact = new Map(used.map((gen, index) => [gen, index]));
  for (const [id, gen] of generation) generation.set(id, compact.get(gen)!);
  return generation;
}

type Row = string[][]; // a row is a list of blocks; a block is a group of partners

function orderRows(
  byId: Map<string, GraphPerson>,
  generation: Map<string, number>,
  parentsOf: Map<string, string[]>,
  childrenOf: Map<string, string[]>,
  couples: [string, string][]
): Row[] {
  const rowCount = Math.max(...generation.values()) + 1;
  const rows: Row[] = Array.from({ length: rowCount }, () => []);

  // Group partners (people in the same row who share a child) into blocks.
  const partnerRoot = new Map<string, string>();
  const find = (id: string): string => {
    const root = partnerRoot.get(id) ?? id;
    if (root === id) return id;
    const top = find(root);
    partnerRoot.set(id, top);
    return top;
  };
  const join = (a: string, b: string) => {
    if (generation.get(a) === generation.get(b) && find(a) !== find(b)) partnerRoot.set(find(b), find(a));
  };
  for (const parents of parentsOf.values()) {
    for (let i = 1; i < parents.length; i++) join(parents[0], parents[i]);
  }
  for (const [a, b] of couples) join(a, b);
  const blocks = new Map<string, string[]>();
  for (const id of byId.keys()) {
    const root = find(id);
    if (!blocks.has(root)) blocks.set(root, []);
    blocks.get(root)!.push(id);
  }
  for (const block of blocks.values()) rows[generation.get(block[0])!].push(block);

  const byAge = (a: string, b: string) => {
    const pa = byId.get(a)!;
    const pb = byId.get(b)!;
    return (pa.birthYear ?? 9999) - (pb.birthYear ?? 9999) || pa.name.localeCompare(pb.name);
  };
  for (const row of rows) {
    for (const block of row) block.sort(byAge);
    row.sort((a, b) => byAge(a[0], b[0]));
  }

  const spouseOf = new Map<string, string[]>();
  for (const [a, b] of couples) {
    spouseOf.set(a, [...(spouseOf.get(a) ?? []), b]);
    spouseOf.set(b, [...(spouseOf.get(b) ?? []), a]);
  }

  const indexOf = new Map<string, number>();
  const reindex = (row: Row) => {
    let index = 0;
    for (const block of row) for (const id of block) indexOf.set(id, index++);
  };
  rows.forEach(reindex);

  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const sortRow = (row: Row, neighbours: Map<string, string[]>) => {
    const keyOf = (id: string) => {
      const related = (neighbours.get(id) ?? []).filter((other) => indexOf.has(other));
      return related.length ? average(related.map((other) => indexOf.get(other)!)) : null;
    };
    for (const block of row) {
      // Within a couple, put the partner whose own relatives are further left on the left.
      block.sort((a, b) => (keyOf(a) ?? Infinity) - (keyOf(b) ?? Infinity) || byAge(a, b));
      if (block.length > 2) keepSpousesTogether(block, spouseOf, keyOf);
    }
    const blockKey = new Map(row.map((block, position) => {
      const keys = block.map(keyOf).filter((key): key is number => key !== null);
      return [block, keys.length ? average(keys) : null] as const;
    }));
    const original = new Map(row.map((block, position) => [block, position]));
    row.sort((a, b) => {
      const ka = blockKey.get(a);
      const kb = blockKey.get(b);
      if (ka == null && kb == null) return original.get(a)! - original.get(b)!;
      if (ka == null) return 1;
      if (kb == null) return -1;
      return ka - kb || byAge(a[0], b[0]);
    });
    reindex(row);
  };

  // A few alternating sweeps reduce crossing lines between generations.
  for (let sweep = 0; sweep < 3; sweep++) {
    for (let gen = 1; gen < rowCount; gen++) sortRow(rows[gen], parentsOf);
    for (let gen = rowCount - 2; gen >= 0; gen--) sortRow(rows[gen], childrenOf);
  }
  for (let gen = 1; gen < rowCount; gen++) sortRow(rows[gen], parentsOf);
  return rows;
}

/** Moves anyone without relatives of their own to sit right beside their spouse. */
function keepSpousesTogether(block: string[], spouseOf: Map<string, string[]>, keyOf: (id: string) => number | null): void {
  const marriedIn = block.filter((id) => keyOf(id) === null && (spouseOf.get(id) ?? []).some((s) => block.includes(s)));
  for (const id of marriedIn) {
    const spouse = spouseOf.get(id)!.find((s) => block.includes(s))!;
    block.splice(block.indexOf(id), 1);
    block.splice(block.indexOf(spouse) + 1, 0, id);
  }
}

function blockWidth(block: string[]): number {
  return block.length * NODE_WIDTH + (block.length - 1) * COUPLE_GAP;
}

function placeRows(rows: Row[], parentsOf: Map<string, string[]>, childrenOf: Map<string, string[]>): Map<string, number> {
  const position = new Map<string, number>();
  const center = (id: string) => position.get(id)! + NODE_WIDTH / 2;
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  const placeRow = (row: Row, desiredCenter: (block: string[]) => number | null) => {
    let nextFree = PADDING;
    for (const block of row) {
      const width = blockWidth(block);
      const desired = desiredCenter(block);
      const left = Math.max(nextFree, desired === null ? nextFree : desired - width / 2);
      block.forEach((id, index) => position.set(id, left + index * (NODE_WIDTH + COUPLE_GAP)));
      nextFree = left + width + BLOCK_GAP;
    }
  };
  const centerOver = (block: string[], related: Map<string, string[]>) => {
    const others = block.flatMap((id) => related.get(id) ?? []).filter((id) => position.has(id));
    return others.length ? average(others.map(center)) : null;
  };

  // Top-down: place each family's children under their parents.
  placeRow(rows[0], () => null);
  for (let gen = 1; gen < rows.length; gen++) {
    placeRow(rows[gen], (block) => centerOver(block, parentsOf));
  }
  // Bottom-up: centre parents over their children.
  for (let gen = rows.length - 2; gen >= 0; gen--) {
    const childRow = new Set(rows[gen + 1].flat());
    const childrenBelow = new Map([...childrenOf].map(([id, kids]) => [id, kids.filter((kid) => childRow.has(kid))]));
    placeRow(rows[gen], (block) => centerOver(block, childrenBelow));
  }

  // Shift so the leftmost card starts at the padding.
  const minX = Math.min(...position.values());
  for (const [id, x] of position) position.set(id, x - minX + PADDING);
  return position;
}

function buildEdges(
  rows: Row[],
  position: Map<string, number>,
  parentsOf: Map<string, string[]>,
  generation: Map<string, number>,
  rowY: (gen: number) => number,
  couples: [string, string][]
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const center = (id: string) => position.get(id)! + NODE_WIDTH / 2;
  const blockOf = new Map<string, string[]>();
  for (const row of rows) for (const block of row) for (const id of block) blockOf.set(id, block);

  // A family unit is a set of parents and the children they share.
  const units = new Map<string, { parents: string[]; children: string[] }>();
  for (const [childId, parents] of parentsOf) {
    if (!parents.length) continue;
    const sorted = [...parents].sort((a, b) => position.get(a)! - position.get(b)!);
    const key = sorted.join('|');
    if (!units.has(key)) units.set(key, { parents: sorted, children: [] });
    units.get(key)!.children.push(childId);
  }

  const drawnCouples = new Set<string>();
  const unitsPerRow = new Map<number, number>();
  for (const { parents, children } of units.values()) {
    const parentGen = Math.max(...parents.map((id) => generation.get(id)!));
    const parentBottom = rowY(parentGen) + NODE_HEIGHT;
    const parentMid = rowY(parentGen) + PHOTO_CENTER_Y;

    // Stagger the horizontal bus of different families in the same gap so they stay distinguishable.
    const slot = unitsPerRow.get(parentGen) ?? 0;
    unitsPerRow.set(parentGen, slot + 1);
    const childTop = Math.min(...children.map((id) => rowY(generation.get(id)!)));
    const busY = childTop - ROW_GAP / 2 + ((slot % 5) - 2) * 6;

    const isCouple = parents.length === 2
      && generation.get(parents[0]) === generation.get(parents[1])
      && blockOf.get(parents[0]) === blockOf.get(parents[1])
      && Math.abs(blockOf.get(parents[0])!.indexOf(parents[0]) - blockOf.get(parents[1])!.indexOf(parents[1])) === 1;

    let dropXs: number[];
    if (isCouple) {
      const [left, right] = parents;
      const coupleKey = `${left}|${right}`;
      const leftEdge = center(left) + PHOTO_SIZE / 2;
      const rightEdge = center(right) - PHOTO_SIZE / 2;
      if (!drawnCouples.has(coupleKey)) {
        edges.push({ kind: 'couple', d: `M${leftEdge},${parentMid} H${rightEdge}` });
        drawnCouples.add(coupleKey);
      }
      const midX = (leftEdge + rightEdge) / 2;
      edges.push({ kind: 'couple-drop', d: `M${midX},${parentMid} V${busY}` });
      dropXs = [midX];
    } else {
      dropXs = parents.map(center);
      for (const x of dropXs) edges.push({ kind: 'descent', d: `M${x},${parentBottom} V${busY}` });
    }

    const childXs = children.map(center);
    const xs = [...dropXs, ...childXs];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (maxX - minX > 0.5) edges.push({ kind: 'descent', d: `M${minX},${busY} H${maxX}` });
    for (const childId of children) {
      const photoTop = rowY(generation.get(childId)!) + PHOTO_CENTER_Y - PHOTO_SIZE / 2;
      edges.push({ kind: 'descent', d: `M${center(childId)},${busY} V${photoTop}` });
    }
  }
  // Married couples without children together still get a marriage line.
  for (const [a, b] of couples) {
    const block = blockOf.get(a);
    if (!block || block !== blockOf.get(b) || Math.abs(block.indexOf(a) - block.indexOf(b)) !== 1) continue;
    const [left, right] = position.get(a)! < position.get(b)! ? [a, b] : [b, a];
    if (drawnCouples.has(`${left}|${right}`)) continue;
    drawnCouples.add(`${left}|${right}`);
    const y = rowY(generation.get(left)!) + PHOTO_CENTER_Y;
    edges.push({ kind: 'couple', d: `M${center(left) + PHOTO_SIZE / 2},${y} H${center(right) - PHOTO_SIZE / 2}` });
  }
  return edges;
}
