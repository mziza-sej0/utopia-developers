/**
 * db.js — MongoDB adapter with Mongoose
 * Exposes the same interface as the in-memory store.
 * Routes don't need to change when swapping DB implementations.
 */

const mongoose = require('mongoose');
const { User, ResetToken, ContactMessage } = require('./models');

// Connect to MongoDB
const connectDB = async (mongoUri) => {
  try {
   await mongoose.connect('mongodb+srv://jose:200507One9.@cluster0.z1fdr08.mongodb.net/utopia-developrs');
console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

/**
 * Users adapter — mimics Map interface
 */
const users = {
  // Create or update user
  set: async (email, userData) => {
    return await User.findOneAndUpdate(
      { email },
      { ...userData, email },
      { upsert: true, new: true }
    );
  },

  // Get user by email
  get: async (email) => {
    return await User.findOne({ email });
  },

  // Check if user exists
  has: async (email) => {
    return !!(await User.findOne({ email }));
  },

  // Delete user
  delete: async (email) => {
    const result = await User.deleteOne({ email });
    return result.deletedCount > 0;
  },

  // Get all users (for admin)
  getAll: async () => {
    return await User.find({});
  },

  // Find by provider ID (for OAuth)
  findByProvider: async (provider, providerId) => {
    return await User.findOne({ provider, providerId });
  },
};

/**
 * Reset tokens adapter — mimics Map interface
 */
const resetTokens = {
  // Store reset token
  set: async (token, data) => {
    return await ResetToken.findOneAndUpdate(
      { token },
      { token, ...data, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }, // 10 min expiry
      { upsert: true, new: true }
    );
  },

  // Get token data
  get: async (token) => {
    return await ResetToken.findOne({ token, expiresAt: { $gt: Date.now() } });
  },

  // Check if token exists and is valid
  has: async (token) => {
    return !!(await ResetToken.findOne({ token, expiresAt: { $gt: Date.now() } }));
  },

  // Delete token
  delete: async (token) => {
    const result = await ResetToken.deleteOne({ token });
    return result.deletedCount > 0;
  },

  // Find by email
  findByEmail: async (email) => {
    return await ResetToken.findOne({ email, expiresAt: { $gt: Date.now() } });
  },
};

/**
 * Contact messages adapter — mimics array interface
 */
const contactMessages = {
  // Add message
  push: async (messageData) => {
    const msg = new ContactMessage(messageData);
    return await msg.save();
  },

  // Get all messages
  getAll: async () => {
    return await ContactMessage.find({}).sort({ createdAt: -1 });
  },

  // Get messages by status
  getByStatus: async (status) => {
    return await ContactMessage.find({ status }).sort({ createdAt: -1 });
  },

  // Mark as read
  markAsRead: async (id) => {
    return await ContactMessage.findByIdAndUpdate(id, { status: 'read' }, { new: true });
  },

  // Mark as responded
  markAsResponded: async (id) => {
    return await ContactMessage.findByIdAndUpdate(id, { status: 'responded' }, { new: true });
  },

  // Get message count
  count: async () => {
    return await ContactMessage.countDocuments();
  },
};

module.exports = {
  connectDB,
  users,
  resetTokens,
  contactMessages,
};

