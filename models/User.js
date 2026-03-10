/**
 * ═══════════════════════════════════════════════════════
 *  Community Hub — User Model (updated)
 *  File: models/User.js
 *
 *  Changes from original:
 *    + banned, bannedAt, bannedReason fields
 *    + toPublic() now includes banned status
 * ═══════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: [60, 'Name too long']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false  // never returned in queries by default
  },
  avatar: {
    color:    { type: String, default: '#F5A623' },
    initials: { type: String, default: '' }
  },
  bio: {
    type: String, trim: true, maxlength: [200, 'Bio too long'], default: ''
  },
  social: {
    twitter:  { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github:   { type: String, default: '' }
  },
  role: {
    type: String, enum: ['user', 'admin'], default: 'user'
  },

  // ── Ban fields (added for admin panel) ──────────────
  banned:       { type: Boolean, default: false },
  bannedAt:     { type: Date },
  bannedReason: { type: String, trim: true },

  // ── Password reset (needed for forgot password) ─────
  resetToken:       { type: String, select: false },
  resetTokenExpiry: { type: Date,   select: false },

}, { timestamps: true });


/* ── Hash password before save ─────────────────────── */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);

  // Auto-set initials from name or email
  if (!this.avatar.initials) {
    if (this.name) {
      const parts = this.name.trim().split(' ');
      this.avatar.initials = parts.length > 1
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].substring(0, 2).toUpperCase();
    } else {
      this.avatar.initials = this.email.substring(0, 2).toUpperCase();
    }
  }
  next();
});


/* ── Compare password ──────────────────────────────── */
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};


/* ── Safe public profile (no password) ────────────── */
userSchema.methods.toPublic = function() {
  return {
    _id:          this._id,
    name:         this.name,
    email:        this.email,
    avatar:       this.avatar,
    bio:          this.bio,
    social:       this.social,
    role:         this.role,
    banned:       this.banned,
    bannedAt:     this.bannedAt,
    bannedReason: this.bannedReason,
    createdAt:    this.createdAt,
  };
};


module.exports = mongoose.model('User', userSchema);