const { Router } = require('express');
const { contactMessages } = require('../db');
const { sendContactEmail } = require('../config/mailer');

const router = Router();

// ─── POST /api/contact ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message, subscribe } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email, and message are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    // Honeypot check (field named _hp must be empty)
    if (req.body._hp) {
      // Silently reject bots
      return res.json({ success: true });
    }

    const entry = {
      id: Date.now(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      subject: (subject || '').trim(),
      message: message.trim(),
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
