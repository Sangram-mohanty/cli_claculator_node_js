const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { randomUUID } = require('node:crypto');
const { mkdir, unlink, writeFile } = require('node:fs/promises');
const path = require('node:path');
const FamilyTree = require('../models/FamilyTree');
const Person = require('../models/Person');
const Relationship = require('../models/Relationship');
const Partnership = require('../models/Partnership');
const { optionalAuth, requireAuth, signedPhotoUrl } = require('../auth/accounts');
const { optionalAdmin, requireAdmin } = require('../auth/admin');
const { createsCycle } = require('../utils/relationshipGraph');

const router = express.Router();
router.use(optionalAuth, optionalAdmin);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || 'uploads');
const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

function isObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function requireObjectId(value, label) {
  if (!isObjectId(value)) {
    const error = new Error(`${label} must be a valid ID.`);
    error.status = 400;
    throw error;
  }
}

function notFound(label) {
  const error = new Error(`${label} was not found.`);
  error.status = 404;
  return error;
}

async function findTree(treeId, req, write = false, allowAdmin = false) {
  requireObjectId(treeId, 'Tree ID');
  const tree = await FamilyTree.findById(treeId).select('+ownerId');
  if (!tree) throw notFound('Family tree');
  if (tree.isDemo) {
    if (write) {
      const error = new Error('The showcase family is read-only.');
      error.status = 403;
      throw error;
    }
    return tree;
  }
  const ownsTree = req.user && String(tree.ownerId) === String(req.user._id);
  const adminHasAccess = req.isAdmin && (!write || allowAdmin);
  if (!ownsTree && !adminHasAccess) {
    throw notFound('Family tree');
  }
  return tree;
}

function personWithPhotoAccess(person) {
  const result = person.toObject();
  if (result.photoUrl) {
    const filename = path.basename(result.photoUrl);
    result.photoUrl = signedPhotoUrl(filename);
  }
  return result;
}

function peopleWithPhotoAccess(people) {
  return people.map(personWithPhotoAccess);
}

router.get('/', async (req, res, next) => {
  try {
    const filter = req.isAdmin
      ? {}
      : req.user
        ? { ownerId: req.user._id }
        : { isDemo: true };
    const trees = await FamilyTree.find(filter).sort({ isDemo: 1, createdAt: 1 });
    res.json(trees);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const tree = await FamilyTree.create({
      ownerId: req.user._id,
      name: req.body.name,
      village: req.body.village,
      district: req.body.district,
      state: req.body.state,
      country: req.body.country,
      surname: req.body.surname
    });
    res.status(201).json(tree);
  } catch (error) {
    next(error);
  }
});

router.get('/:treeId/people', async (req, res, next) => {
  try {
    await findTree(req.params.treeId, req);
    res.json(peopleWithPhotoAccess(await Person.find({ treeId: req.params.treeId }).sort({ name: 1 })));
  } catch (error) {
    next(error);
  }
});

router.post('/:treeId/people', requireAuth, async (req, res, next) => {
  try {
    await findTree(req.params.treeId, req, true);
    const person = await Person.create({
      treeId: req.params.treeId,
      name: req.body.name,
      gender: req.body.gender,
      birthYear: req.body.birthYear
    });
    res.status(201).json(personWithPhotoAccess(person));
  } catch (error) {
    next(error);
  }
});

router.get('/:treeId/people/:personId/relatives', async (req, res, next) => {
  try {
    const { treeId, personId } = req.params;
    await findTree(treeId, req);
    requireObjectId(personId, 'Person ID');
    const person = await Person.findOne({ _id: personId, treeId });
    if (!person) throw notFound('Person');

    const [parentLinks, childLinks, partnerships] = await Promise.all([
      Relationship.find({ treeId, childId: personId }),
      Relationship.find({ treeId, parentId: personId }),
      Partnership.find({ treeId, $or: [{ personA: personId }, { personB: personId }] })
    ]);
    const spouseIds = partnerships.map((link) => String(link.personA) === String(personId) ? link.personB : link.personA);
    const parentIds = parentLinks.map((link) => link.parentId);
    const childIds = childLinks.map((link) => link.childId);
    const siblingLinks = parentIds.length
      ? await Relationship.find({ treeId, parentId: { $in: parentIds }, childId: { $ne: personId } })
      : [];
    const siblingIds = [...new Set(siblingLinks.map((link) => String(link.childId)))];
    const [parents, siblings, children, spouses] = await Promise.all([
      Person.find({ _id: { $in: parentIds }, treeId }).sort({ name: 1 }),
      Person.find({ _id: { $in: siblingIds }, treeId }).sort({ name: 1 }),
      Person.find({ _id: { $in: childIds }, treeId }).sort({ name: 1 }),
      Person.find({ _id: { $in: spouseIds }, treeId }).sort({ name: 1 })
    ]);
    res.json({
      person: personWithPhotoAccess(person),
      parents: peopleWithPhotoAccess(parents),
      siblings: peopleWithPhotoAccess(siblings),
      children: peopleWithPhotoAccess(children),
      spouses: peopleWithPhotoAccess(spouses)
    });
  } catch (error) {
    next(error);
  }
});

async function findPerson(treeId, personId, req, write = false, allowAdmin = false) {
  await findTree(treeId, req, write, allowAdmin);
  requireObjectId(personId, 'Person ID');
  const person = await Person.findOne({ _id: personId, treeId });
  if (!person) throw notFound('Person');
  return person;
}

async function removePhotoFile(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return;
  const filename = path.basename(photoUrl);
  await unlink(path.join(uploadDirectory, filename)).catch(() => {});
}

router.patch('/:treeId', requireAuth, async (req, res, next) => {
  try {
    const tree = await findTree(req.params.treeId, req, true);
    for (const field of ['name', 'village', 'district', 'state', 'country', 'surname']) {
      if (req.body[field] !== undefined) tree[field] = req.body[field];
    }
    await tree.save();
    res.json(tree);
  } catch (error) {
    next(error);
  }
});

router.delete('/:treeId', requireAdmin, async (req, res, next) => {
  try {
    const tree = await findTree(req.params.treeId, req, true, true);
    const people = await Person.find({ treeId: tree._id }).select('photoUrl');
    await Promise.all([
      Relationship.deleteMany({ treeId: tree._id }),
      Partnership.deleteMany({ treeId: tree._id }),
      Person.deleteMany({ treeId: tree._id })
    ]);
    await tree.deleteOne();
    await Promise.all(people.map((person) => removePhotoFile(person.photoUrl)));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.patch('/:treeId/people/:personId', requireAuth, async (req, res, next) => {
  try {
    const person = await findPerson(req.params.treeId, req.params.personId, req, true);
    if (req.body.name !== undefined) person.name = req.body.name;
    if (req.body.gender !== undefined) person.gender = req.body.gender ?? '';
    if (req.body.birthYear !== undefined) person.birthYear = req.body.birthYear ?? undefined;
    await person.save();
    res.json(personWithPhotoAccess(person));
  } catch (error) {
    next(error);
  }
});

router.delete('/:treeId/people/:personId', requireAdmin, async (req, res, next) => {
  try {
    const person = await findPerson(req.params.treeId, req.params.personId, req, true, true);
    await Promise.all([
      Relationship.deleteMany({
        treeId: person.treeId,
        $or: [{ parentId: person._id }, { childId: person._id }]
      }),
      Partnership.deleteMany({
        treeId: person.treeId,
        $or: [{ personA: person._id }, { personB: person._id }]
      })
    ]);
    await person.deleteOne();
    await removePhotoFile(person.photoUrl);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:treeId/partnerships', async (req, res, next) => {
  try {
    await findTree(req.params.treeId, req);
    res.json(await Partnership.find({ treeId: req.params.treeId }).select('personA personB type'));
  } catch (error) {
    next(error);
  }
});

router.post('/:treeId/partnerships', requireAuth, async (req, res, next) => {
  try {
    const { treeId } = req.params;
    const { personId, partnerId, type } = req.body;
    await findTree(treeId, req, true);
    requireObjectId(personId, 'Person ID');
    requireObjectId(partnerId, 'Partner ID');
    if (String(personId) === String(partnerId)) {
      return res.status(400).json({ error: 'A person cannot be married to themselves.' });
    }
    const [person, partner] = await Promise.all([
      Person.findOne({ _id: personId, treeId }),
      Person.findOne({ _id: partnerId, treeId })
    ]);
    if (!person || !partner) {
      return res.status(400).json({ error: 'Both people must exist in this family tree.' });
    }
    const directLink = await Relationship.exists({
      treeId,
      $or: [{ parentId: personId, childId: partnerId }, { parentId: partnerId, childId: personId }]
    });
    if (directLink) {
      return res.status(400).json({ error: 'A parent and child cannot be married.' });
    }
    const [personA, personB] = Partnership.orderedPair(personId, partnerId);
    const partnership = await Partnership.create({ treeId, personA, personB, type });
    return res.status(201).json(partnership);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'These two people are already married.' });
    return next(error);
  }
});

router.delete('/:treeId/partnerships/:personId/:partnerId', requireAdmin, async (req, res, next) => {
  try {
    const { treeId, personId, partnerId } = req.params;
    await findTree(treeId, req, true, true);
    requireObjectId(personId, 'Person ID');
    requireObjectId(partnerId, 'Partner ID');
    const [personA, personB] = Partnership.orderedPair(personId, partnerId);
    const result = await Partnership.deleteOne({ treeId, personA, personB });
    if (!result.deletedCount) throw notFound('Marriage');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:treeId/relationships', async (req, res, next) => {
  try {
    await findTree(req.params.treeId, req);
    res.json(await Relationship.find({ treeId: req.params.treeId }).select('parentId childId type'));
  } catch (error) {
    next(error);
  }
});

router.delete('/:treeId/people/:personId/photo', requireAdmin, async (req, res, next) => {
  try {
    const person = await findPerson(req.params.treeId, req.params.personId, req, true, true);
    const previousPhoto = person.photoUrl;
    person.photoUrl = '';
    await person.save();
    await removePhotoFile(previousPhoto);
    res.json({ person: personWithPhotoAccess(person) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:treeId/relationships/:parentId/:childId', requireAdmin, async (req, res, next) => {
  try {
    const { treeId, parentId, childId } = req.params;
    await findTree(treeId, req, true, true);
    requireObjectId(parentId, 'Parent ID');
    requireObjectId(childId, 'Child ID');
    const result = await Relationship.deleteOne({ treeId, parentId, childId });
    if (!result.deletedCount) throw notFound('Family connection');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/:treeId/relationships', requireAuth, async (req, res, next) => {
  try {
    const { treeId } = req.params;
    const { parentId, childId, type } = req.body;
    await findTree(treeId, req, true);
    requireObjectId(parentId, 'Parent ID');
    requireObjectId(childId, 'Child ID');
    if (String(parentId) === String(childId)) {
      return res.status(400).json({ error: 'A person cannot be their own parent.' });
    }

    const [parent, child] = await Promise.all([
      Person.findOne({ _id: parentId, treeId }),
      Person.findOne({ _id: childId, treeId })
    ]);
    if (!parent || !child) {
      return res.status(400).json({ error: 'Both people must exist in this family tree.' });
    }

    const [personA, personB] = Partnership.orderedPair(parentId, childId);
    if (await Partnership.exists({ treeId, personA, personB })) {
      return res.status(400).json({ error: 'Married partners cannot also be parent and child.' });
    }

    const relationships = await Relationship.find({ treeId }).select('parentId childId');
    if (createsCycle(relationships, parentId, childId)) {
      return res.status(400).json({ error: 'This connection would create a family relationship cycle.' });
    }

    const relationship = await Relationship.create({ treeId, parentId, childId, type });
    return res.status(201).json(relationship);
  } catch (error) {
    return next(error);
  }
});

router.post('/:treeId/people/:personId/photo', requireAuth, upload.single('photo'), async (req, res, next) => {
  try {
    const { treeId, personId } = req.params;
    await findTree(treeId, req, true);
    requireObjectId(personId, 'Person ID');
    const person = await Person.findOne({ _id: personId, treeId });
    if (!person) throw notFound('Person');
    if (!req.file) {
      return res.status(400).json({ error: 'Choose a JPEG, PNG, or WebP photo to upload.' });
    }

    const { fileTypeFromBuffer } = await import('file-type');
    const detectedType = await fileTypeFromBuffer(req.file.buffer);
    const extension = detectedType && allowedImageTypes.get(detectedType.mime);
    if (!extension) {
      return res.status(400).json({ error: 'Only valid JPEG, PNG, and WebP image files are allowed.' });
    }

    const filename = `${randomUUID()}.${extension}`;
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, filename), req.file.buffer, { flag: 'wx' });
    const previousPhoto = person.photoUrl;
    person.photoUrl = `/uploads/${filename}`;
    await person.save();
    await removePhotoFile(previousPhoto);
    return res.json({ person: personWithPhotoAccess(person) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
