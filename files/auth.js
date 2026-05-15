const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const { users, resetTokens } = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../config/mailer');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helpers ────────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    if (users.has(email.toLowerCase())) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      provider: 'local',
      createdAt: new Date().toISOString(),
    };
    users.set(user.email, user);

    const token = signToken(user);
    res.status(201).json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = users.get(email.toLowerCase().trim());
    if (!user || user.provider !== 'local') {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
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

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email.toLowerCase();

    let user = users.get(email);
    if (!user) {
      user = {
        id: uuidv4(),
        name: payload.name,
        email,
        passwordHash: null,
        provider: 'google',
        avatar: payload.picture,
        createdAt: new Date().toISOString(),
      };
      users.set(email, user);
    }

    const jwtToken = signToken(user);
    res.json({ success: true, token: jwtToken, user: safeUser(user) });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
});

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Always return 200 to avoid email enumeration
    const user = users.get(email.toLowerCase().trim());
    if (user && user.provider === 'local') {
      const token = uuidv4();
      resetTokens.set(token, {
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
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const record = resetTokens.get(token);
    if (!record || record.expires < Date.now()) {
      return res.status(400).json({ success: false, error: 'Reset link is invalid or has expired' });
    }

    const user = users.get(record.email);
    if (!user) {
      return res.status(400).json({ success: false, error: 'User not found' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    users.set(user.email, user);
    resetTokens.delete(token);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  const user = users.get(req.user.email);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  res.json({ success: true, user: safeUser(user) });
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// Stateless JWT — client simply discards the token.
// Extend this with a token denylist if you need server-side revocation.
router.post('/logout', authenticate, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
