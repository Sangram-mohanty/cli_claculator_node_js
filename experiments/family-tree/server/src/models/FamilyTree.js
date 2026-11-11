const mongoose = require('mongoose');

const familyTreeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  village: { type: String, required: true, trim: true, maxlength: 100 },
  surname: { type: String, required: true, trim: true, maxlength: 100 }
}, { timestamps: true });

module.exports = mongoose.model('FamilyTree', familyTreeSchema);
