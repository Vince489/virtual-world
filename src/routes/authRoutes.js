import express from 'express';
import rateLimit from 'express-rate-limit';
import { signup, login, refreshToken, logout, logoutAll } from '../controllers/authController.js';
import { verifyTokenVersion } from '../middleware/verifyTokenVersion.js';

const router = express.Router();

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
});

// Public routes
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout); // Public logout for cookie clearing

// Protected routes - require token version verification
router.post('/logout-all', verifyTokenVersion, logoutAll);

export default router;
