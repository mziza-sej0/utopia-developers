const nodemailer = require('nodemailer');

// ─── Transporter ─────────────────────────────────────────────────────────────
// In development (no EMAIL_USER set) we use Ethereal for safe test delivery.
// In production set EMAIL_HOST / EMAIL_USER / EMAIL_PASS in your .env.

let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.EMAIL_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Ethereal test account — preview URLs logged to console
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('📧  No EMAIL_USER set — using Ethereal test account:', testAccount.user);
  }

  return transporter;
}

const FROM = process.env.EMAIL_FROM || '"Utopia Developers" <noreply@utopiadevelopers.com>';
const OWNER_EMAIL = process.env.EMAIL_USER || 'services@utopiadevelopers.com';

// ─── Contact form email ───────────────────────────────────────────────────────
async function sendContactEmail({ name, email, subject, message }) {
  const t = await getTransporter();

  // Notification to site owner
  const ownerInfo = await t.sendMail({
    from: FROM,
    to: OWNER_EMAIL,
    replyTo: email,
    subject: `[Utopia] New contact: ${subject || 'No subject'} — from ${name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1f9cf0">New Contact Form Submission</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px;font-weight:bold">Name</td><td style="padding:6px">${name}</td></tr>
          <tr><td style="padding:6px;font-weight:bold">Email</td><td style="padding:6px"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:6px;font-weight:bold">Subject</td><td style="padding:6px">${subject || '—'}</td></tr>
        </table>
        <hr style="margin:1rem 0"/>
        <p style="white-space:pre-wrap">${message}</p>
      </div>
    `,
  });
  console.log('Owner notification sent. Preview:', nodemailer.getTestMessageUrl(ownerInfo));

  // Auto-reply to sender
  const replyInfo = await t.sendMail({
    from: FROM,
    to: email,
    subject: 'We received your message — Utopia Developers',
    html: `
      <div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1f9cf0">Thanks, ${name}!</h2>
        <p>We've received your message and will get back to you within <strong>1-2 business days</strong>.</p>
        <blockquote style="border-left:3px solid #1f9cf0;padding-left:1rem;color:#6b7280;margin:1rem 0">
          ${message}
        </blockquote>
        <p>— The Utopia Developers Team</p>
        <hr style="margin:1.5rem 0;border:none;border-top:1px solid #e5e7eb"/>
        <p style="font-size:0.85rem;color:#6b7280">
          <a href="https://utopiadevelopers.com">utopiadevelopers.com</a> · (+254) 743 325 039
        </p>
      </div>
    `,
  });
  console.log('Auto-reply sent. Preview:', nodemailer.getTestMessageUrl(replyInfo));
}

// ─── Password reset email ─────────────────────────────────────────────────────
async function sendPasswordResetEmail(email, name, token) {
  const t = await getTransporter();
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5500'}/reset-password.html?token=${token}`;

  const info = await t.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your Utopia Developers password',
    html: `
      <div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1f9cf0">Password Reset Request</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
        <p style="text-align:center;margin:2rem 0">
          <a href="${resetUrl}" style="background:#1f9cf0;color:#fff;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:bold">
            Reset Password
          </a>
        </p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p style="font-size:0.85rem;color:#6b7280">Link: <a href="${resetUrl}">${resetUrl}</a></p>
      </div>
    `,
  });
  console.log('Password reset email sent. Preview:', nodemailer.getTestMessageUrl(info));
}

module.exports = { sendContactEmail, sendPasswordResetEmail };
