import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Middleware to verify that the token version matches the user's current token version
 * This prevents tokens from being used after logout or token version increment
 */
export const verifyTokenVersion = async (req, res, next) => {
  try {
    // Get token from cookies
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Decode token to get userId and tokenVersion
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user in database
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Check if token version matches
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Token version mismatch - please login again' });
    }

    // Attach user to request for use in subsequent middleware
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};
