import express from 'express';
import rateLimit from 'express-rate-limit';
import { signup, login } from '../controllers/authController.js';

const router = express.Router();

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
});

router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);

export default router;
