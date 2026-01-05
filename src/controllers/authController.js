import User from '../models/User.js';
import winston from 'winston';
import jwt from 'jsonwebtoken';
import { sendPasswordResetEmail } from '../config/emailService.js';
import { redisClient, redisBreaker } from '../services/redisService.js';
import { maskEmail } from '../utils/emailMasker.js';
import {
  validatePasswordStrength,
  generateResetToken,
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  verifyPassword,
  generateTokenHash
} from '../services/authService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

/**
 * Utility function to fetch the full user object when needed
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} The full user object
 */
export const getUserById = async (userId) => {
  return await User.findById(userId);
};

export const signup = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      logger.warn('Signup attempt with missing fields', { username, email: maskEmail(email), ip: req.ip });
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      logger.warn('Signup attempt with weak password', { username, email: maskEmail(email), ip: req.ip });
      return res.status(400).json({ message: passwordError });
    }

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      logger.warn('Signup attempt with existing username or email', { username, email: maskEmail(email), ip: req.ip });
      return res.status(409).json({ message: 'Username or email already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email
        // Other non-sensitive fields
      }
    });
  } catch (error) {
    logger.error('Signup error:', error);
    if (error.code === 11000) { // Duplicate key error
      res.status(409).json({ message: 'Username or email already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      logger.warn('Login attempt with missing fields', { username, ip: req.ip });
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      logger.warn(`Login attempt for non-existent user: ${username}`, { ip: req.ip });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.isLocked) {
      logger.warn(`Login attempt on locked account: ${username}`, { ip: req.ip });
      return res.status(423).json({ message: 'Account is temporarily locked due to too many failed attempts' });
    }

    const isValidPassword = await verifyPassword(user.password, password);
    if (!isValidPassword) {
      // Increment failed attempts
      await user.incLoginAttempts();
      logger.warn(`Failed login attempt for user: ${username}`, { ip: req.ip });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Generate tokens with tokenVersion
    const accessToken = generateAccessToken(user._id, user.tokenVersion);
    const { token: refreshToken, hash: tokenHash } = generateRefreshToken(user._id, user.tokenVersion);

    // Set secure cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Secure in production
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Update the current valid token hash in the user model
    await User.findByIdAndUpdate(user._id, { currentValidTokenHash: tokenHash });

    logger.info(`Successful login for user: ${username}`, { ip: req.ip });
    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email
        // Other non-sensitive fields
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Refresh access token using refresh token
 * Implements refresh token rotation for security with Redis resilience
 */
export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies ? req.cookies.refreshToken : null;

    if (!refreshToken) {
      logger.warn('Refresh token attempt with no token provided', { ip: req.ip });
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const usedTokenKey = `usedRefreshToken:${refreshToken}`;

    // Check if this refresh token has been used before (potential breach)
    // Use circuit breaker and safe operation pattern
    let isTokenUsed = null;
    let isRecentReuse = null;
    let redisErrorOccurred = false;

    try {
      // Check if token was used before (with circuit breaker)
      isTokenUsed = await redisBreaker.execute(
        async () => await redisClient.get(usedTokenKey)
      );

      if (isTokenUsed) {
        // Check for recent reuse within leeway window
        isRecentReuse = await redisBreaker.execute(
          async () => await redisClient.get(`${usedTokenKey}:leeway`)
        );
      }
    } catch (redisError) {
      logger.warn('Redis operation failed during token validation', {
        error: redisError.message,
        userId: decoded.userId,
        ip: req.ip
      });
      redisErrorOccurred = true;
    }

    if (redisErrorOccurred) {
      // Continue with token version validation only
      logger.warn('Proceeding with MongoDB-only token validation due to Redis failure');
    } else if (isTokenUsed) {
      // Redis is working - proceed with normal reuse detection
      if (!isRecentReuse) {
        // Outside leeway window - potential breach
        logger.error(`CRITICAL: Refresh token reuse detected for user: ${decoded.userId} - Potential security breach!`, {
          ip: req.ip,
          severity: 'high'
        });

        // Increment token version to invalidate all tokens for this user
        await User.findByIdAndUpdate(decoded.userId, { $inc: { tokenVersion: 1 } });

        // Clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');

        return res.status(401).json({
          message: 'Security alert: Potential token breach detected. Please login again.'
        });
      } else {
        // Allow reuse within 30-second leeway window
        logger.warn(`Refresh token reused within leeway window for user: ${decoded.userId}`, { ip: req.ip });
      }
    }

    // Find user in database
    const user = await User.findById(decoded.userId);

    if (!user) {
      logger.warn(`Refresh token attempt for non-existent user: ${decoded.userId}`, { ip: req.ip });
      return res.status(401).json({ message: 'User not found' });
    }

    // Check if token version matches
    if (decoded.tokenVersion !== user.tokenVersion) {
      logger.warn(`Refresh token attempt with invalid token version for user: ${user.username}`, { ip: req.ip });
      return res.status(401).json({ message: 'Token version mismatch - please login again' });
    }

    // Only check token hash if we're not in the Redis leeway window
    // This prevents the "double lock" conflict where Redis allows reuse but DB hash check rejects it
    if (!isRecentReuse) {
      const tokenHash = generateTokenHash(refreshToken);
      if (user.currentValidTokenHash && user.currentValidTokenHash !== tokenHash) {
        logger.warn(`Refresh token attempt with invalid token hash for user: ${user.username}`, { ip: req.ip });
        return res.status(401).json({ message: 'Token invalid - please login again' });
      }
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user._id, user.tokenVersion);

    // Generate new refresh token (rotation)
    const { token: newRefreshToken, hash: newTokenHash } = generateRefreshToken(user._id, user.tokenVersion);

    // Mark the old refresh token as used in Redis
    try {
      // Set the token as used
      await redisBreaker.execute(
        async () => await redisClient.set(usedTokenKey, '1')
      );

      // Set leeway window for 30 seconds to allow for network delays
      await redisBreaker.execute(
        async () => await redisClient.set(`${usedTokenKey}:leeway`, '1', {
          EX: 30 // 30 seconds TTL
        })
      );
    } catch (redisError) {
      logger.warn('Failed to mark refresh token as used in Redis', {
        error: redisError.message,
        userId: user._id,
        ip: req.ip
      });
      // Continue even if Redis fails - token rotation still works
    }

    // Update the current valid token hash in the user model
    await User.findByIdAndUpdate(user._id, { currentValidTokenHash: newTokenHash });

    // Set new access token cookie
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    // Set new refresh token cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logger.info(`Access token refreshed for user: ${user.username}`, { ip: req.ip });
    res.json({ message: 'Access token refreshed successfully' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid refresh token attempt', { ip: req.ip });
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    if (error.name === 'TokenExpiredError') {
      logger.warn('Expired refresh token attempt', { ip: req.ip });
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    if (error.message.includes('Redis') || error.message.includes('circuit breaker')) {
      logger.error('Redis-related error during token refresh', {
        error: error.message,
        ip: req.ip
      });
      return res.status(503).json({
        message: 'Authentication service temporarily unavailable',
        code: 'AUTH_SERVICE_TEMPORARILY_UNAVAILABLE',
        retryAfter: 300 // 5 minutes
      });
    }
    logger.error('Refresh token error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Logout - clear tokens for current session
 */
export const logout = async (req, res) => {
  try {
    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    logger.info('User logged out', { ip: req.ip });
    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Logout from all devices - increment token version
 */
export const logoutAll = async (req, res) => {
  try {
    // Get user ID from request (should be set by verifyTokenVersion middleware)
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Increment token version (critical operation - must succeed)
    await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });

    // Attempt to clean up Redis cache, but don't fail if Redis is down
    try {
      await redisBreaker.execute(
        async () => await redisClient.del(`tokenVersion:${userId}`)
      );
    } catch (redisError) {
      logger.warn('Failed to clean up Redis cache during logoutAll', {
        error: redisError.message,
        userId,
        ip: req.ip
      });
      // Continue despite Redis failure - token version increment is what matters
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    logger.info(`User ${userId} logged out from all devices`, { ip: req.ip });
    res.json({ message: 'Logged out from all devices successfully' });
  } catch (error) {
    logger.error('Logout all error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update user password with cache invalidation
 */
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!currentPassword || !newPassword) {
      logger.warn('Password update attempt with missing fields', { userId, ip: req.ip });
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Validate new password strength
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      logger.warn('Password update attempt with weak new password', { userId, ip: req.ip });
      return res.status(400).json({ message: passwordError });
    }

    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`Password update attempt for non-existent user: ${userId}`, { ip: req.ip });
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await verifyPassword(user.password, currentPassword);
    if (!isValidPassword) {
      logger.warn(`Invalid current password for user: ${userId}`, { ip: req.ip });
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password and increment token version
    await User.findByIdAndUpdate(userId, {
      password: hashedPassword,
      $inc: { tokenVersion: 1 }
    });

    // Attempt to clean up Redis cache, but don't fail if Redis is down
    try {
      await redisBreaker.execute(
        async () => await redisClient.del(`tokenVersion:${userId}`)
      );
    } catch (redisError) {
      logger.warn('Failed to clean up Redis cache during password update', {
        error: redisError.message,
        userId,
        ip: req.ip
      });
      // Continue despite Redis failure - token version increment is what matters
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    logger.info(`Password updated successfully for user: ${userId}`, { ip: req.ip });
    res.json({ message: 'Password updated successfully. Please login again.' });
  } catch (error) {
    logger.error('Password update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Request password reset - generate and send reset token
 */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      logger.warn('Password reset request with missing email', { ip: req.ip });
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists or not for security
      logger.info(`Password reset requested for non-existent email: ${maskEmail(email)}`, { ip: req.ip });
      return res.status(200).json({ message: 'If this email exists in our system, a password reset link has been sent' });
    }

    // Generate reset token
    const resetToken = generateResetToken();
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Update user with reset token
    await User.findByIdAndUpdate(user._id, {
      resetToken,
      resetTokenExpires
    });

    // Generate reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Send email with reset link
    const emailSent = await sendPasswordResetEmail(user.email, resetUrl);

    if (!emailSent) {
      logger.error(`Failed to send password reset email to user: ${user.username}`, { ip: req.ip });
      // Still return success to prevent email enumeration
      res.status(200).json({
        message: 'If this email exists in our system, a password reset link has been sent'
      });
      return;
    }

    logger.info(`Password reset email sent to user: ${user.username}`, { ip: req.ip });

    res.status(200).json({
      message: 'If this email exists in our system, a password reset link has been sent',
      // In development, return the token for testing purposes
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });
  } catch (error) {
    logger.error('Password reset request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Reset password - validate token and update password
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      logger.warn('Password reset attempt with missing fields', { ip: req.ip });
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    // Validate new password strength
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      logger.warn('Password reset attempt with weak new password', { ip: req.ip });
      return res.status(400).json({ message: passwordError });
    }

    // Find user by reset token
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() } // Token not expired
    });

    if (!user) {
      logger.warn('Password reset attempt with invalid or expired token', { ip: req.ip });
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password, clear reset token, and increment token version
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null,
      $inc: { tokenVersion: 1 }
    });

    // Attempt to clean up Redis cache, but don't fail if Redis is down
    try {
      await redisBreaker.execute(
        async () => await redisClient.del(`tokenVersion:${user._id}`)
      );
    } catch (redisError) {
      logger.warn('Failed to clean up Redis cache during password reset', {
        error: redisError.message,
        userId: user._id,
        ip: req.ip
      });
      // Continue despite Redis failure - token version increment is what matters
    }

    logger.info(`Password reset successfully for user: ${user.username}`, { ip: req.ip });
    res.json({ message: 'Password reset successfully. Please login with your new password.' });
  } catch (error) {
    logger.error('Password reset error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
