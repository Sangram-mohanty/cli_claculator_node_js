const mongoose = require('mongoose');

const personSchema = new mongoose.Schema({
  treeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTree', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  gender: { type: String, enum: ['', 'Woman', 'Man', 'Other'], default: '' },
  birthYear: { type: Number, min: 1000, max: new Date().getFullYear() },
  photoUrl: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Person', personSchema);
