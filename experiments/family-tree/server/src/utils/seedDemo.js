const FamilyTree = require('../models/FamilyTree');
const Person = require('../models/Person');
const Relationship = require('../models/Relationship');
const Partnership = require('../models/Partnership');

const COUPLES_PER_GENERATION = [1, 2, 4, 2, 1];
const FIRST_NAMES = [
  'Ari', 'Bea', 'Cleo', 'Dashiell', 'Elio', 'Freya', 'Gideon', 'Hana', 'Ilya', 'Junia',
  'Kian', 'Liora', 'Mira', 'Niko', 'Orla', 'Pia', 'Quinn', 'Remy', 'Sora', 'Talia',
  'Uma', 'Veda', 'Wren', 'Xavi', 'Yara'
];
const SURNAMES = ['Meadow', 'Reed', 'Chen', 'Lane'];
const DEMO_TREE = {
  name: 'The Meadow Family',
  surname: 'Meadow',
  village: 'Willowbrook',
  district: 'Sample County',
  state: 'Example State',
  country: 'Sampleland',
  isDemo: true
};

async function seedDemoFamily() {
  let tree = await FamilyTree.findOne({ isDemo: true }).select('+ownerId');
  if (!tree) tree = await FamilyTree.create(DEMO_TREE);
  else {
    Object.assign(tree, DEMO_TREE, { ownerId: null });
    await tree.save();
  }

  const expectedPeople = COUPLES_PER_GENERATION.reduce((total, count) => total + count, 0) * 2;
  const expectedPartnerships = expectedPeople / 2;
  const expectedRelationships = (expectedPeople - COUPLES_PER_GENERATION[0] * 2) * 2;
  const [peopleCount, relationshipCount, partnershipCount, uniqueNameCount] = await Promise.all([
    Person.countDocuments({ treeId: tree._id }),
    Relationship.countDocuments({ treeId: tree._id }),
    Partnership.countDocuments({ treeId: tree._id }),
    Person.distinct('name', { treeId: tree._id }).then((names) => names.length)
  ]);
  if (peopleCount === expectedPeople
    && relationshipCount === expectedRelationships
    && partnershipCount === expectedPartnerships
    && uniqueNameCount === expectedPeople) return;

  await Promise.all([
    Relationship.deleteMany({ treeId: tree._id }),
    Partnership.deleteMany({ treeId: tree._id }),
    Person.deleteMany({ treeId: tree._id })
  ]);

  const entries = [];
  const parentChildIndexes = [];
  const coupleIndexes = [];
  let personNumber = 0;
  const nextName = () => {
    const name = `${FIRST_NAMES[personNumber % FIRST_NAMES.length]} ${SURNAMES[Math.floor(personNumber / FIRST_NAMES.length)]}`;
    personNumber += 1;
    return name;
  };
  const addCouple = (generation, coupleNumber) => {
    const couple = [];
    for (let partner = 0; partner < 2; partner += 1) {
      couple.push(entries.length);
      entries.push({
        name: nextName(),
        gender: partner === 0 ? 'Woman' : 'Man',
        birthYear: 1908 + generation * 18 + (coupleNumber % 6)
      });
    }
    return couple;
  };

  let couples = Array.from({ length: COUPLES_PER_GENERATION[0] }, (_, index) => addCouple(0, index));
  for (let generation = 0; generation < COUPLES_PER_GENERATION.length; generation += 1) {
    coupleIndexes.push(...couples);
    if (generation === COUPLES_PER_GENERATION.length - 1) break;

    const nextCoupleCount = COUPLES_PER_GENERATION[generation + 1];
    const childrenPerCouple = (nextCoupleCount * 2) / couples.length;
    if (!Number.isInteger(childrenPerCouple)) {
      throw new Error('The showcase family structure must produce whole sibling counts.');
    }
    const childrenByHousehold = couples.map(([parentA, parentB], coupleNumber) => {
      const children = [];
      for (let childNumber = 0; childNumber < childrenPerCouple; childNumber += 1) {
        const childIndex = entries.length;
        entries.push({
          name: nextName(),
          gender: childNumber % 2 === 0 ? 'Woman' : 'Man',
          birthYear: 1908 + (generation + 1) * 18 + (childNumber % 6)
        });
        children.push(childIndex);
        parentChildIndexes.push([parentA, childIndex], [parentB, childIndex]);
      }
      return children;
    });
    const children = [];
    for (let childNumber = 0; childNumber < childrenPerCouple; childNumber += 1) {
      for (const household of childrenByHousehold) children.push(household[childNumber]);
    }
    couples = [];
    for (let index = 0; index < children.length; index += 2) {
      couples.push([children[index], children[index + 1]]);
    }
  }

  const created = await Person.insertMany(entries.map((person) => ({ treeId: tree._id, ...person })));
  await Promise.all([
    Relationship.insertMany(parentChildIndexes.map(([parent, child]) => ({
      treeId: tree._id,
      parentId: created[parent]._id,
      childId: created[child]._id
    }))),
    Partnership.insertMany(coupleIndexes.map(([person, partner]) => {
      const [personA, personB] = Partnership.orderedPair(created[person]._id, created[partner]._id);
      return { treeId: tree._id, personA, personB };
    }))
  ]);
}

module.exports = { seedDemoFamily };
