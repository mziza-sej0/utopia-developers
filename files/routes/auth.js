const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { hash, compare } = require('bcryptjs');
const { sign } = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const { users, resetTokens } = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../config/mailer');

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Rate Limiters ──────────────────────────────────────────────────────────
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: 'Too many registration attempts, please try again later',
  skip: (req) => !req.body.email, // Skip if no email in request
  keyGenerator: (req) => req.body.email || req.ip, // Use email as key
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
  skip: (req) => !req.body.email,
  keyGenerator: (req) => req.body.email || req.ip,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: 'Too many password reset requests, please try again later',
  skip: (req) => !req.body.email,
  keyGenerator: (req) => req.body.email || req.ip,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function signToken(user) {
  return sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  const u = user && user.toObject ? user.toObject() : user || {};
  const { password, passwordHash, _id, __v, ...rest } = u;
  return rest;
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  try {
    let { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }

    // Sanitize and validate inputs
    name = validator.trim(name);
    email = validator.trim(email.toLowerCase());

    // Length checks
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Name must be between 2 and 100 characters' });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ success: false, error: 'Password must be between 8 and 128 characters' });
    }

    if (await users.has(email)) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    const hashedPassword = await hash(password, 12);
    const user = {
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      provider: 'local',
      createdAt: new Date().toISOString(),
    };
    await users.set(user.email, user);

    const token = signToken(user);
    res.status(201).json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Sanitize inputs
    email = validator.trim(email.toLowerCase());
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const user = await users.get(email);
    if (!user || user.provider !== 'local') {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await compare(password, user.password || user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
});

// ─── POST /api/auth/google ───────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Google token is required' });
    }

    // Validate token format
    token = validator.trim(String(token));
    if (token.length < 10 || token.length > 2000) {
      return res.status(400).json({ success: false, error: 'Invalid token' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = validator.normalizeEmail(payload.email);

    let user = await users.get(email);
    if (!user) {
      const name = validator.trim(String(payload.name || 'User')).substring(0, 100);
      user = {
        id: uuidv4(),
        name,
        email,
        password: null,
        provider: 'google',
        avatar: validator.isURL(payload.picture) ? payload.picture : null,
        createdAt: new Date().toISOString(),
      };
      user = await users.set(email, user);
    }

    const jwtToken = signToken(user);
    res.json({ success: true, token: jwtToken, user: safeUser(user) });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
});

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Sanitize email
    email = validator.trim(email.toLowerCase());
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Always return 200 to avoid email enumeration
    const user = await users.get(email);
    if (user && user.provider === 'local') {
      const token = uuidv4();
      await resetTokens.set(token, {
        email: user.email,
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });
      await sendPasswordResetEmail(user.email, user.name, token);
    }

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    let { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }

    // Validate token format (UUID)
    token = validator.trim(token);
    if (!validator.isUUID(token)) {
      return res.status(400).json({ success: false, error: 'Invalid or malformed reset token' });
    }

    // Validate password length
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ success: false, error: 'Password must be between 8 and 128 characters' });
    }

    const record = await resetTokens.get(token);
    if (!record || record.expires < Date.now()) {
      return res.status(400).json({ success: false, error: 'Reset link is invalid or has expired' });
    }

    const user = await users.get(record.email);
    if (!user) {
      return res.status(400).json({ success: false, error: 'User not found' });
    }

    user.password = await hash(password, 12);
    await users.set(user.email, user);
    await resetTokens.delete(token);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await users.get(req.user.email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// Stateless JWT — client simply discards the token.
// Extend this with a token denylist if you need server-side revocation.
router.post('/logout', authenticate, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
