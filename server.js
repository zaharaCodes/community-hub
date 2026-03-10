require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const path      = require('path');

const app = express();

/* ═══════════════════════════════════════
   MIDDLEWARE
═══════════════════════════════════════ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve everything in /public as static files
app.use(express.static(path.join(__dirname, 'public')));

/* ═══════════════════════════════════════
   DATABASE
═══════════════════════════════════════ */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

/* ═══════════════════════════════════════
   ROUTES
═══════════════════════════════════════ */
const authRoutes     = require('./routes/auth');
const resourceRoutes = require('./routes/resource');
const adminRoutes    = require('./routes/admin');      // ← NEW

app.use('/api/auth',      authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/admin',     adminRoutes);               // ← NEW

/* ═══════════════════════════════════════
   FALLBACK — serve index.html for any
   unknown route (SPA-style)
═══════════════════════════════════════ */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ═══════════════════════════════════════
   START
═══════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});