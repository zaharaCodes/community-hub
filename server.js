require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const path      = require('path');
const cors      = require('cors');

const app = express();

/* ═══════════════════════════════════════
   CORS — allow Vercel frontend + localhost
═══════════════════════════════════════ */
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://community-hub-liart-three.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

/* ═══════════════════════════════════════
   MIDDLEWARE
═══════════════════════════════════════ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files only served in development
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
}

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
const adminRoutes    = require('./routes/admin');

app.use('/api/auth',      authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/admin',     adminRoutes);

/* ═══════════════════════════════════════
   HEALTH CHECK
═══════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/* ═══════════════════════════════════════
   FALLBACK
═══════════════════════════════════════ */
app.get('*', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

/* ═══════════════════════════════════════
   START
═══════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});