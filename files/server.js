require('dotenv').config();

const express = require('express');
const { json, urlencoded } = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./db');
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contact');
const paymentRoutes = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Trust Proxy ─────────────────────────────────────────────────────────────
// Required for express-rate-limit to work correctly behind a reverse proxy (like ngrok or Heroku)
// This allows it to use the X-Forwarded-For header to get the real client IP.
app.set('trust proxy', 1);


// ─── MongoDB Connection ──────────────────────────────────────────────────────

connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/utopia-developers')
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Allow localhost and 127.0.0.1 in development
const allowedOrigins = process.env.CLIENT_URL 
  ? [process.env.CLIENT_URL]
  : ['http://localhost:3000','http://127.0.0.1:3000'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  credentials: true,
}));

app.use(json({ limit: '10kb' }));
app.use(urlencoded({ extended: true, limit: '10kb' }));

// ─── Security Headers ───────────────────────────────────────────────────────

app.use((req, res, next) => {
  // Allow popups to send messages back (needed for Google Sign-In)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many auth attempts, please wait 15 minutes.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, error: 'Too many messages sent. Please try again in an hour.' },
});

app.use(generalLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/contact', contactLimiter, contactRoutes);
app.use('/api/payment', paymentRoutes);

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    database: 'mongodb',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ─── Root Endpoint ───────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ success: true, message: 'Welcome to the Utopia Developers API' });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ─── Global Error Handler ────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║   🚀  Utopia Developers API running      ║
    ║   Port    : ${PORT}                          ║
    ║   Env     : ${(process.env.NODE_ENV || 'development').padEnd(12)}              ║
    ╚══════════════════════════════════════════╝
  
    Endpoints:
      POST  /api/auth/register
      POST  /api/auth/login
      POST  /api/auth/google
      POST  /api/auth/forgot-password
      POST  /api/auth/reset-password
      GET   /api/auth/me         (JWT required)
      POST  /api/auth/logout     (JWT required)
      POST  /api/contact
      GET   /api/health
    `);
  });

  // Graceful shutdown to release the port (especially useful with nodemon)
  process.once('SIGUSR2', () => {
    server.close(() => process.kill(process.pid, 'SIGUSR2'));
  });
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}

module.exports = app;
