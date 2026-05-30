const { User } = require('../models');
const { authenticate } = require('./auth'); // Assumes your JWT middleware is in './auth.js'

/**
 * Middleware to ensure a user is both authenticated and an administrator.
 * This builds upon the existing `authenticate` middleware.
 *
 * It first authenticates the JWT, then fetches the user from the database
 * to verify their `isAdmin` status, preventing roles from being spoofed
 * in an old token.
 */
const adminOnly = (req, res, next) => {
  // First, run the standard JWT authentication to get the user payload
  authenticate(req, res, async () => {
    try {
      // The `authenticate` middleware should attach a user payload with an `id`
      if (!req.user || !req.user.id) {
        return res.status(403).json({ success: false, error: 'Forbidden: Admin access required.' });
      }

      // Fetch the full user document from the database to verify their role
      const user = await User.findById(req.user.id).lean();

      if (!user || !user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden: Admin access required.' });
      }

      // Attach the full, verified admin user object to the request
      req.user = user;
      next();
    } catch (error) {
      console.error('Admin authorization error:', error);
      res.status(500).json({ success: false, error: 'Server error during authorization.' });
    }
  });
};

module.exports = { adminOnly };