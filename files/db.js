/**
 * db.js — MongoDB adapter with Mongoose
 * Exposes the same interface as the in-memory store.
 * Routes don't need to change when swapping DB implementations.
 */
require('dotenv').config(); // Loads the variables from the .env file
const mongoose = require('mongoose');
const { User, ResetToken, ContactMessage } = require('./models');

// Connect to MongoDB
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/utopia-developers';
  const isDefaultUri = !process.env.MONGODB_URI;

  try {
    await mongoose.connect(uri);
    // Use mongoose.connection.host to show where it connected, redacting credentials
    const safeHost = uri.includes('@') ? uri.split('@')[1] : uri.split('//')[1];
    console.log(`✓ MongoDB connected to: ${safeHost}`);
  } catch (error) {
    let errorMessage = `❌ MongoDB connection error: ${error.message}\n`;
    if (isDefaultUri) {
      errorMessage += 'Could not find MONGODB_URI in the .env file, falling back to the local default. ';
    }
    errorMessage += 'Ensure the database server is running or your environment variables are set correctly.';
    console.error(errorMessage);
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
