const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const xss = require('xss');
const { contactMessages } = require('../db');
const { sendContactEmail } = require('../config/mailer');

const router = Router();

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const contactLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute
  message: 'Too many contact submissions, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── POST /api/contact ───────────────────────────────────────────────────────
router.post('/', contactLimiter, async (req, res) => {
  try {
    let { name, email, subject, message, subscribe } = req.body;

    // Basic validation with length checks
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email, and message are required' });
    }

    // Validate email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    // Length validation to prevent abuse
    if (name.length > 100 || message.length > 5000 || (subject && subject.length > 200)) {
      return res.status(400).json({ success: false, error: 'Input fields exceed maximum length' });
    }

    // Honeypot check (field named _hp must be empty)
    if (req.body._hp && req.body._hp.trim() !== '') {
      // Silently reject bots
      return res.json({ success: true });
    }

    // Sanitize inputs to prevent XSS
    name = xss(name.trim(), { whiteList: {}, stripIgnoredTag: true });
    email = validator.trim(email.toLowerCase());
    subject = xss((subject || '').trim(), { whiteList: {}, stripIgnoredTag: true });
    message = xss(message.trim(), { whiteList: {}, stripIgnoredTag: true });

    const entry = {
      id: Date.now(),
      name,
      email,
      subject,
      message,
      subscribe: !!subscribe,
      receivedAt: new Date().toISOString(),
    };

    await contactMessages.push(entry);

    // Send notification email to site owner + auto-reply to sender
    await sendContactEmail(entry);

    res.json({ success: true, message: "Message received! We'll be in touch within 1-2 business days." });
  } catch (err) {
    console.error('Contact error:', err);
    res.status(500).json({ success: false, error: 'Failed to send message. Please try again.' });
  }
});

// ─── GET /api/contact (admin only — simple token check for demo) ─────────────
router.get('/', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const messages = await contactMessages.getAll();
    res.json({ success: true, total: messages.length, messages });
  } catch (err) {
    console.error('Fetch contact messages error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

module.exports = router;
