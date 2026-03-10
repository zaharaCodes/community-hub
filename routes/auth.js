require('dotenv').config();
const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const rateLimit = require('express-rate-limit');
const User    = require('../models/User');
const protect = require('../middleware/authMiddleware');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/* ── Rate limiter: max 10 auth attempts per 15 min ── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' }
});

/* ═══════════════════════════════════════════════════
   POST /api/auth/check-email
═══════════════════════════════════════════════════ */
router.post('/check-email', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    res.json({ exists: !!user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/auth/register
═══════════════════════════════════════════════════ */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: 'An account with this email already exists.' });

    const user  = await User.create({ email, password, name: name || '' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.status(201).json({ token, user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/auth/login
═══════════════════════════════════════════════════ */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    if (user.banned) return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ token, user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   GET /api/auth/me
═══════════════════════════════════════════════════ */
router.get('/me', protect, async (req, res) => {
  try {
    res.json({ user: req.user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   PUT /api/auth/profile  — update name / bio / social
═══════════════════════════════════════════════════ */
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, bio, social } = req.body;
    const user = await User.findById(req.user._id);
    if (name !== undefined) user.name = name;
    if (bio  !== undefined) user.bio  = bio;
    if (social && typeof social === 'object') {
      user.social.twitter  = social.twitter  ?? user.social.twitter;
      user.social.linkedin = social.linkedin ?? user.social.linkedin;
      user.social.github   = social.github   ?? user.social.github;
    }
    await user.save();
    res.json({ user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   PUT /api/auth/change-password
═══════════════════════════════════════════════════ */
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

    const user = await User.findById(req.user._id).select('+password');
    const match = await user.comparePassword(currentPassword);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   DELETE /api/auth/account
═══════════════════════════════════════════════════ */
router.delete('/account', protect, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Incorrect password.' });

    const Resource = require('../models/Resource');
    await Resource.deleteMany({ submittedBy: req.user._id });
    await user.deleteOne();
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/auth/forgot-password
   Always returns success (never reveals if email exists)
═══════════════════════════════════════════════════ */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    // Respond immediately — security: never reveal if account exists
    res.json({ message: 'If an account exists, a reset link has been sent.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return;

    // Generate secure token
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.findByIdAndUpdate(user._id, {
      resetToken:       token,
      resetTokenExpiry: expiry,
    });

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;

    // Send email
    await resend.emails.send({
      from:    process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to:      user.email,
      subject: 'Reset your Community Hub password',
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

    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#F5A623">Password Reset</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#F0EDE8;line-height:1.2">Reset your password</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#888;line-height:1.6">
      Hi ${user.name || 'there'},<br><br>
      We received a request to reset the password for your Community Hub account.
      Click the button below — this link expires in <strong style="color:#F0EDE8">1 hour</strong>.
    </p>

    <!-- BUTTON -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:28px">
        <a href="${resetLink}"
           style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#F5A623,#FF6B6B);color:#fff;text-decoration:none;border-radius:11px;font-weight:700;font-size:15px">
          Reset My Password →
        </a>
      </td></tr>
    </table>

    <p style="margin:0 0 16px;font-size:13px;color:#666;line-height:1.6">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 28px;font-size:12px;color:#F5A623;word-break:break-all">${resetLink}</p>

    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 24px">
    <p style="margin:0;font-size:12px;color:#555;line-height:1.6">
      If you didn't request this, you can safely ignore this email — your password won't change.<br>
      This link expires in 1 hour for security.
    </p>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding-top:24px;text-align:center">
    <p style="margin:0;font-size:12px;color:#444">
      © 2026 Community Hub · Built for the community
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
    });

  } catch (err) {
    console.error('[forgot-password]', err);
    // Don't expose error — response already sent
  }
});

/* ═══════════════════════════════════════════════════
   POST /api/auth/reset-password
   Validates token and sets new password
═══════════════════════════════════════════════════ */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    // Find user with valid non-expired token
    const user = await User.findOne({
      resetToken:       token,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    // Set new password and clear reset token
    user.password         = password;
    user.resetToken       = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    // Auto-login: issue new JWT
    const newToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.json({
      message: 'Password reset successfully!',
      token:   newToken,
      user:    user.toPublic(),
    });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;