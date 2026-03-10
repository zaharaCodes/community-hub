/**
 * ═══════════════════════════════════════════════════════
 *  Community Hub — Resource Model
 *  File: models/Resource.js
 *
 *  If you already have this model, add the `reports`
 *  array field shown below. Everything else stays the same.
 * ═══════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason:     { type: String, trim: true, maxlength: 300 },
  createdAt:  { type: Date, default: Date.now },
}, { _id: false });

const resourceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Resource name is required'],
    trim: true,
    maxlength: [120, 'Name too long'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['food', 'shelter', 'health', 'mental', 'job', 'education', 'legal', 'other'],
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true,
    maxlength: [120, 'Location too long'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description too long'],
  },
  contact: {
    type: String,
    trim: true,
    maxlength: [200, 'Contact info too long'],
    default: '',
  },
  tags: {
    type: [String],
    default: [],
  },
  helpful: {
    type: Number,
    default: 0,
    min: 0,
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // ── Reports/flags (added for admin panel) ───────────
  reports: {
    type: [reportSchema],
    default: [],
  },

}, { timestamps: true });

// Text index for fast search
resourceSchema.index({ name: 'text', description: 'text', location: 'text' });

module.exports = mongoose.model('Resource', resourceSchema);