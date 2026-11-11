const mongoose = require('mongoose');

/**
 * A marriage (or partnership) between two people in the same tree.
 * The pair is stored in a fixed order (personA < personB) so each couple exists once.
 */
const partnershipSchema = new mongoose.Schema({
  treeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTree', required: true, index: true },
  personA: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true },
  personB: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true },
  type: { type: String, enum: ['married', 'partner'], default: 'married' }
}, { timestamps: true });

partnershipSchema.index({ personA: 1, personB: 1 }, { unique: true });

partnershipSchema.statics.orderedPair = function orderedPair(first, second) {
  return String(first) < String(second) ? [first, second] : [second, first];
};

module.exports = mongoose.model('Partnership', partnershipSchema);
