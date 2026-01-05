import express from 'express';
import { signup, login, refreshToken, logout, logoutAll, getUserById, requestPasswordReset, resetPassword } from '../controllers/authController.js';
import { verifyTokenVersion } from '../middleware/verifyTokenVersion.js';

const router = express.Router();

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout); // Public logout for cookie clearing
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);

// Protected routes - require token version verification
router.post('/logout-all', verifyTokenVersion, logoutAll);

// Example route that needs the full user object
router.get('/profile', verifyTokenVersion, async (req, res) => {
  try {
    // Use the utility function to fetch the full user object when needed
    const user = await getUserById(req.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user profile data (excluding sensitive information)
    const { password, tokenVersion, ...userProfile } = user.toObject();
    res.json(userProfile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
