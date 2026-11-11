const mongoose = require('mongoose');

const relationshipSchema = new mongoose.Schema({
  treeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTree', required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true },
  type: { type: String, enum: ['biological', 'adoptive', 'guardian'], default: 'biological' }
}, { timestamps: true });

relationshipSchema.index({ parentId: 1, childId: 1 }, { unique: true });

module.exports = mongoose.model('Relationship', relationshipSchema);
