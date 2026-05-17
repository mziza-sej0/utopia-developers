/**
 * models.js — Mongoose schemas for Utopia Developers
 * Define all data models here; routes use db.js to interact with them
 */

const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    password: { type: String }, // optional for OAuth users
    picture: { type: String }, // for OAuth avatars
    provider: { type: String, enum: ['local', 'google', 'github'], default: 'local' },
    providerId: { type: String }, // OAuth ID
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Reset Token Schema
const resetTokenSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, // auto-delete after expiry
  },
  { timestamps: true }
);

// Contact Message Schema
const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String },
    message: { type: String, required: true },
    status: { type: String, enum: ['new', 'read', 'responded'], default: 'new' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Payment Schema (for M-Pesa transactions)
const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String },
    checkoutRequestId: { type: String, unique: true },
    mpesaReceiptNumber: { type: String },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    resultCode: { type: String },
    resultDescription: { type: String },
    transactionDate: { type: Date },
  },
  { timestamps: true }
);

// Export models
module.exports = {
  User: mongoose.model('User', userSchema),
  ResetToken: mongoose.model('ResetToken', resetTokenSchema),
  ContactMessage: mongoose.model('ContactMessage', contactMessageSchema),
  Payment: mongoose.model('Payment', paymentSchema),
};
