import { GraphLink, GraphPerson, NODE_WIDTH, layoutFamilyGraph } from './family-graph.layout';

const person = (id: string, gender = '', birthYear?: number): GraphPerson => ({ _id: id, name: id, gender, birthYear });
const link = (parentId: string, childId: string): GraphLink => ({ parentId, childId });

function byName(layout: ReturnType<typeof layoutFamilyGraph>) {
  return new Map(layout.nodes.map((node) => [node.person._id, node]));
}

describe('layoutFamilyGraph', () => {
  it('returns an empty layout for no people', () => {
    expect(layoutFamilyGraph([], []).nodes).toEqual([]);
  });

  it('puts each generation on its own row, parents above children', () => {
    const people = [person('Grandpa', 'Man'), person('Dad', 'Man'), person('Me')];
    const layout = byName(layoutFamilyGraph(people, [link('Grandpa', 'Dad'), link('Dad', 'Me')]));
    expect(layout.get('Grandpa')!.generation).toBe(0);
    expect(layout.get('Dad')!.generation).toBe(1);
    expect(layout.get('Me')!.generation).toBe(2);
    expect(layout.get('Grandpa')!.y).toBeLessThan(layout.get('Dad')!.y);
  });

  it('keeps a married-in parent on the same row as their partner', () => {
    // Dad has parents in the tree; Mom does not, but she shares a child with Dad.
    const people = [person('Grandpa', 'Man'), person('Dad', 'Man'), person('Mom', 'Woman'), person('Me')];
    const links = [link('Grandpa', 'Dad'), link('Dad', 'Me'), link('Mom', 'Me')];
    const layout = byName(layoutFamilyGraph(people, links));
    expect(layout.get('Mom')!.generation).toBe(layout.get('Dad')!.generation);
    expect(Math.abs(layout.get('Mom')!.x - layout.get('Dad')!.x)).toBeLessThan(NODE_WIDTH * 1.5);
  });

  it('centres a child beneath both parents and draws a couple line', () => {
    const people = [person('Dad', 'Man'), person('Mom', 'Woman'), person('Kid')];
    const result = layoutFamilyGraph(people, [link('Dad', 'Kid'), link('Mom', 'Kid')]);
    const layout = byName(result);
    const parentsCenter = (layout.get('Dad')!.x + layout.get('Mom')!.x) / 2 + NODE_WIDTH / 2;
    expect(layout.get('Kid')!.x + NODE_WIDTH / 2).toBeCloseTo(parentsCenter, 0);
    expect(result.edges.filter((edge) => edge.kind === 'couple').length).toBe(1);
  });

  it('never overlaps cards in the same row', () => {
    const people = ['P', 'A', 'B', 'C', 'D', 'X'].map((id) => person(id));
    const links = ['A', 'B', 'C', 'D'].map((child) => link('P', child));
    const nodes = layoutFamilyGraph(people, links).nodes;
    for (const a of nodes) {
      for (const b of nodes) {
        if (a !== b && a.generation === b.generation) {
          expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(NODE_WIDTH);
        }
      }
    }
  });

  it('draws a marriage line for a couple without children and keeps them side by side', () => {
    const people = [person('Grandpa', 'Man'), person('Son', 'Man'), person('Wife', 'Woman'), person('Brother', 'Man')];
    const links = [link('Grandpa', 'Son'), link('Grandpa', 'Brother')];
    const result = layoutFamilyGraph(people, links, [{ personA: 'Son', personB: 'Wife' }]);
    const layout = byName(result);
    expect(layout.get('Wife')!.generation).toBe(layout.get('Son')!.generation);
    expect(Math.abs(layout.get('Wife')!.x - layout.get('Son')!.x)).toBeLessThan(NODE_WIDTH * 1.5);
    expect(result.edges.filter((edge) => edge.kind === 'couple').length).toBe(1);
  });

  it('moves a married-in spouse’s parents and siblings down to sit beside them', () => {
    // Sara marries into a family drawn three rows down; her brother Paresh must share her row.
    const people = ['Somnath', 'Bairagi', 'Gopi', 'Gyan', 'Purna', 'Surama', 'Sara', 'Paresh', 'Kishan', 'Sangram']
      .map((id) => person(id));
    const links = [
      link('Somnath', 'Bairagi'), link('Bairagi', 'Gopi'), link('Gopi', 'Gyan'),
      link('Gyan', 'Sangram'), link('Sara', 'Sangram'),
      link('Purna', 'Sara'), link('Purna', 'Paresh'), link('Surama', 'Paresh'), link('Paresh', 'Kishan')
    ];
    const layout = byName(layoutFamilyGraph(people, links, [{ personA: 'Purna', personB: 'Surama' }]));
    const gen = (id: string) => layout.get(id)!.generation;
    expect(gen('Sara')).toBe(gen('Gyan'));
    expect(gen('Paresh')).toBe(gen('Sara'));
    expect(gen('Purna')).toBe(gen('Sara') - 1);
    expect(gen('Surama')).toBe(gen('Purna'));
    expect(gen('Kishan')).toBe(gen('Paresh') + 1);
  });

  it('ignores links to people who are not in the list', () => {
    const layout = layoutFamilyGraph([person('Only')], [link('Ghost', 'Only')]);
    expect(layout.nodes.length).toBe(1);
    expect(layout.edges).toEqual([]);
  });
});
