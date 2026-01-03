import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createClient } from 'redis';

// Create Redis client
const redisClient = createClient({
  url: 'redis://localhost:6379'
});

// Connect to Redis
redisClient.connect().catch(console.error);

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

    // Check Redis cache first
    const cachedTokenVersion = await redisClient.get(`tokenVersion:${decoded.userId}`);

    let userTokenVersion;

    if (cachedTokenVersion) {
      // Use cached token version
      userTokenVersion = parseInt(cachedTokenVersion);
    } else {
      // Fetch from database if not in cache
      const user = await User.findById(decoded.userId).select('tokenVersion');

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      userTokenVersion = user.tokenVersion;

      // Cache the token version for 5 minutes
      await redisClient.set(`tokenVersion:${decoded.userId}`, userTokenVersion.toString(), {
        EX: 300 // 5 minutes in seconds
      });
    }

    // Check if token version matches
    if (decoded.tokenVersion !== userTokenVersion) {
      return res.status(401).json({ message: 'Token version mismatch - please login again' });
    }

    // Attach decoded user info to request for use in subsequent middleware
    // Only the userId is attached by default to avoid unnecessary database queries
    req.userId = decoded.userId;

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
