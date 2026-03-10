/**
 * routes/resource.js
 * Full resource routes — detail, report, vote with email notification
 */

const router   = require('express').Router();
const Resource = require('../models/Resource');
const User     = require('../models/User');
const protect  = require('../middleware/authMiddleware');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/* ═══════════════════════════════════════════════════
   GET /api/resources
   Public — all resources (for app.html grid)
═══════════════════════════════════════════════════ */
router.get('/', async (req, res) => {
  try {
    const resources = await Resource.find()
      .populate('submittedBy', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   GET /api/resources/:id
   Public — single resource with full submitter info
═══════════════════════════════════════════════════ */
router.get('/:id', async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('submittedBy', 'name avatar email');
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });
    res.json(resource);
  } catch (err) {
    if (err.kind === 'ObjectId') return res.status(404).json({ error: 'Resource not found.' });
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/resources
   Auth required — create new resource
═══════════════════════════════════════════════════ */
router.post('/', protect, async (req, res) => {
  try {
    const { name, category, location, description, contact, tags } = req.body;
    if (!name || !category || !location || !description) {
      return res.status(400).json({ error: 'Name, category, location, and description are required.' });
    }
    const resource = await Resource.create({
      name, category, location, description,
      contact:     contact || '',
      tags:        tags || [],
      submittedBy: req.user._id,
    });
    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   PUT /api/resources/:id
   Auth required — edit (owner or admin)
═══════════════════════════════════════════════════ */
router.put('/:id', protect, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    const isOwner = String(resource.submittedBy) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not authorised.' });

    const { name, category, location, description, contact, tags } = req.body;
    if (name)              resource.name        = name;
    if (category)          resource.category    = category;
    if (location)          resource.location    = location;
    if (description)       resource.description = description;
    if (contact !== undefined) resource.contact = contact;
    if (tags    !== undefined) resource.tags    = tags;

    await resource.save();
    res.json(resource);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   DELETE /api/resources/:id
   Auth required — delete (owner or admin)
═══════════════════════════════════════════════════ */
router.delete('/:id', protect, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    const isOwner = String(resource.submittedBy) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not authorised.' });

    await resource.deleteOne();
    res.json({ message: 'Resource deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/resources/:id/helpful
   Public — upvote + email notification at milestones
═══════════════════════════════════════════════════ */
router.post('/:id/helpful', async (req, res) => {
  try {
    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpful: 1 } },
      { new: true }
    ).populate('submittedBy', 'name email');

    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    // Respond immediately
    res.json({ helpful: resource.helpful });

    // Send email at milestones: 1, 5, 10, 25, 50, 100, 250, 500
    const milestones = [1, 5, 10, 25, 50, 100, 250, 500];
    const submitter  = resource.submittedBy;

    if (submitter && submitter.email && milestones.includes(resource.helpful)) {
      const resourceUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/resource.html?id=${resource._id}`;
      const plural      = resource.helpful === 1 ? 'person' : 'people';
      const firstName   = submitter.name ? submitter.name.split(' ')[0] : 'there';

      await resend.emails.send({
        from:    process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to:      submitter.email,
        subject: `🎉 Your resource just helped ${resource.helpful} ${plural}!`,
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0E0E;padding:48px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">

  <!-- LOGO -->
  <tr><td style="padding-bottom:32px;text-align:center">
    <table cellpadding="0" cellspacing="0" style="display:inline-table">
      <tr>
        <td style="width:36px;height:36px;background:linear-gradient(135deg,#F5A623,#FF6B6B);border-radius:9px;text-align:center;vertical-align:middle;font-weight:900;color:#fff;font-size:14px">CH</td>
        <td style="padding-left:10px;font-size:18px;font-weight:800;color:#F0EDE8;vertical-align:middle">Community Hub</td>
      </tr>
    </table>
  </td></tr>

  <!-- CARD -->
  <tr><td style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px">

    <div style="text-align:center;margin-bottom:24px">
      <div style="width:64px;height:64px;background:rgba(245,166,35,0.1);border:2px solid #F5A623;border-radius:50%;display:inline-block;line-height:64px;font-size:28px">🎉</div>
    </div>

    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#F5A623;text-align:center">Community Impact</p>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#F0EDE8;line-height:1.2;text-align:center">
      ${resource.helpful} ${plural} found your<br>resource helpful!
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#888;line-height:1.6;text-align:center">
      Hi ${firstName}, your submission<br>
      <strong style="color:#F0EDE8">"${resource.name}"</strong><br>
      is making a real difference. 💛
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,166,35,0.06);border:1px solid rgba(245,166,35,0.15);border-radius:12px;margin-bottom:28px">
      <tr><td style="padding:20px;text-align:center">
        <div style="font-size:48px;font-weight:900;color:#F5A623;line-height:1">${resource.helpful}</div>
        <div style="font-size:13px;color:#888;margin-top:6px">people helped</div>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:24px">
        <a href="${resourceUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#F5A623,#FF6B6B);color:#fff;text-decoration:none;border-radius:11px;font-weight:700;font-size:15px">
          View Your Resource →
        </a>
      </td></tr>
    </table>

    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 20px">
    <p style="margin:0;font-size:12px;color:#555;text-align:center;line-height:1.6">
      Keep sharing — every resource makes your community stronger. 🌱
    </p>

  </td></tr>

  <tr><td style="padding-top:24px;text-align:center">
    <p style="margin:0;font-size:12px;color:#444">© 2026 Community Hub · Built for the community</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
      }).catch(err => console.error('[vote-email]', err));
    }

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/resources/:id/unhelpful
   Public — remove a helpful vote
═══════════════════════════════════════════════════ */
router.post('/:id/unhelpful', async (req, res) => {
  try {
    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpful: -1 } },
      { new: true }
    );
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });
    // Don't let helpful go below 0
    if (resource.helpful < 0) {
      await Resource.findByIdAndUpdate(req.params.id, { helpful: 0 });
      return res.json({ helpful: 0 });
    }
    res.json({ helpful: resource.helpful });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/resources/:id/report
   Auth required — flag a resource
═══════════════════════════════════════════════════ */
router.post('/:id/report', protect, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    // Block duplicate reports from same user
    const already = resource.reports.some(
      r => String(r.reportedBy) === String(req.user._id)
    );
    if (already) return res.status(409).json({ error: 'You have already reported this resource.' });

    resource.reports.push({
      reportedBy: req.user._id,
      reason:     req.body.reason || 'No reason provided',
    });
    await resource.save();

    res.json({ message: 'Report submitted. Thank you!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;