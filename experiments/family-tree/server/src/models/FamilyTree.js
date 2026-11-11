const mongoose = require('mongoose');

const familyTreeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  village: { type: String, required: true, trim: true, maxlength: 100 },
  // Where the family comes from. Optional in the database so families created earlier stay valid.
  district: { type: String, trim: true, maxlength: 100, default: '' },
  state: { type: String, trim: true, maxlength: 100, default: '' },
  country: { type: String, trim: true, maxlength: 100, default: '' },
  surname: { type: String, required: true, trim: true, maxlength: 100 }
}, { timestamps: true });

module.exports = mongoose.model('FamilyTree', familyTreeSchema);
