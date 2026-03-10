/**
 * ═══════════════════════════════════════════════════════
 *  Community Hub — Admin Routes
 *  File: routes/admin.js
 *
 *  Mount in server.js:
 *    const adminRoutes = require('./routes/admin');
 *    app.use('/api/admin', adminRoutes);
 *
 *  All routes require: valid JWT + role === 'admin'
 * ═══════════════════════════════════════════════════════
 */

const router   = require('express').Router();
const User     = require('../models/User');
const Resource = require('../models/Resource');
const protect  = require('../middleware/authMiddleware');

/* ─────────────────────────────────────────────────────
   MIDDLEWARE — Admin guard
   Runs after `protect` (which sets req.user)
───────────────────────────────────────────────────── */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access only.' });
  }
  next();
}

// Apply to all routes in this file
router.use(protect, adminOnly);


/* ═══════════════════════════════════════════════════
   OVERVIEW STATS
   GET /api/admin/stats
   Returns aggregate numbers for the dashboard cards.
═══════════════════════════════════════════════════ */
router.get('/stats', async (req, res) => {
  try {
    const [totalResources, totalUsers, votesAgg, flaggedCount] = await Promise.all([
      Resource.countDocuments(),
      User.countDocuments(),
      Resource.aggregate([{ $group: { _id: null, total: { $sum: '$helpful' } } }]),
      Resource.countDocuments({ 'reports.0': { $exists: true } }),
    ]);

    const totalVotes = votesAgg.length ? votesAgg[0].total : 0;

    res.json({
      resources: totalResources,
      users:     totalUsers,
      votes:     totalVotes,
      flagged:   flaggedCount,
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   ALL USERS
   GET /api/admin/users
   Query params:
     ?search=   — filter by name or email (case-insensitive)
     ?role=     — filter by role (user | admin)
     ?banned=   — "true" → only banned accounts
     ?sort=     — newest (default) | oldest | az
     ?page=     — page number (default 1)
     ?limit=    — per page (default 20, max 100)
═══════════════════════════════════════════════════ */
router.get('/users', async (req, res) => {
  try {
    const { search = '', role = '', banned = '', sort = 'newest', page = 1, limit = 20 } = req.query;
    const perPage = Math.min(parseInt(limit) || 20, 100);
    const skip    = (Math.max(parseInt(page) || 1, 1) - 1) * perPage;

    // Build filter
    const filter = {};
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (role === 'admin' || role === 'user') filter.role = role;
    if (banned === 'true')  filter.banned = true;
    if (banned === 'false') filter.banned = { $ne: true };

    // Sort
    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt:  1 },
      az:     { name: 1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const [users, total] = await Promise.all([
      User.find(filter)
          .select('-password')
          .sort(sortObj)
          .skip(skip)
          .limit(perPage),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / perPage) });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   BAN USER
   POST /api/admin/users/:id/ban
   Body (optional): { reason: 'Spam' }
   Cannot ban yourself or another admin.
═══════════════════════════════════════════════════ */
router.post('/users/:id/ban', async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot ban yourself.' });
    }

    const user = await User.findById(req.params.id);
    if (!user)          return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot ban another admin. Demote them first.' });
    }

    user.banned       = true;
    user.bannedAt     = new Date();
    user.bannedReason = req.body.reason || 'Banned by admin';
    await user.save();

    res.json({ message: 'User banned.', user: user.toPublic() });
  } catch (err) {
    console.error('[admin/ban]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   UNBAN USER
   POST /api/admin/users/:id/unban
═══════════════════════════════════════════════════ */
router.post('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.banned       = false;
    user.bannedAt     = undefined;
    user.bannedReason = undefined;
    await user.save();

    res.json({ message: 'User unbanned.', user: user.toPublic() });
  } catch (err) {
    console.error('[admin/unban]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   CHANGE USER ROLE
   PUT /api/admin/users/:id/role
   Body: { role: 'admin' | 'user' }
   Cannot change your own role.
═══════════════════════════════════════════════════ */
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "admin" or "user".' });
    }
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({ message: `Role updated to ${role}.`, user });
  } catch (err) {
    console.error('[admin/role]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   DELETE USER
   DELETE /api/admin/users/:id
   Also deletes all resources submitted by that user.
   Cannot delete yourself.
═══════════════════════════════════════════════════ */
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot delete your own account from the admin panel.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Delete their resources too
    const { deletedCount } = await Resource.deleteMany({ submittedBy: req.params.id });
    await user.deleteOne();

    res.json({ message: 'User and their resources deleted.', resourcesDeleted: deletedCount });
  } catch (err) {
    console.error('[admin/deleteUser]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   ALL RESOURCES (admin view — includes submitter info)
   GET /api/admin/resources
   Query params same as public /api/resources but
   also returns submitter details and reports.
═══════════════════════════════════════════════════ */
router.get('/resources', async (req, res) => {
  try {
    const { search = '', category = '', sort = 'newest', page = 1, limit = 20, flagged = '' } = req.query;
    const perPage = Math.min(parseInt(limit) || 20, 100);
    const skip    = (Math.max(parseInt(page) || 1, 1) - 1) * perPage;

    const filter = {};
    if (search)   filter.$or = [
      { name:        { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { location:    { $regex: search, $options: 'i' } },
    ];
    if (category) filter.category = category;
    if (flagged === 'true') filter['reports.0'] = { $exists: true };

    const sortMap = {
      newest:  { createdAt: -1 },
      oldest:  { createdAt:  1 },
      helpful: { helpful:   -1 },
      az:      { name:       1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const [resources, total] = await Promise.all([
      Resource.find(filter)
              .populate('submittedBy', 'name email avatar')
              .sort(sortObj)
              .skip(skip)
              .limit(perPage),
      Resource.countDocuments(filter),
    ]);

    res.json({ resources, total, page: parseInt(page), pages: Math.ceil(total / perPage) });
  } catch (err) {
    console.error('[admin/resources]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   CLEAR REPORTS (dismiss flag) ON A RESOURCE
   POST /api/admin/resources/:id/clear-reports
═══════════════════════════════════════════════════ */
router.post('/resources/:id/clear-reports', async (req, res) => {
  try {
    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      { $set: { reports: [] } },
      { new: true }
    );
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    res.json({ message: 'Reports cleared.', resource });
  } catch (err) {
    console.error('[admin/clearReports]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ═══════════════════════════════════════════════════
   DELETE ANY RESOURCE (admin override)
   DELETE /api/admin/resources/:id
   (Also accessible via existing DELETE /api/resources/:id
    if user.role === 'admin', but this is explicit.)
═══════════════════════════════════════════════════ */
router.delete('/resources/:id', async (req, res) => {
  try {
    const resource = await Resource.findByIdAndDelete(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    res.json({ message: 'Resource deleted.' });
  } catch (err) {
    console.error('[admin/deleteResource]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;