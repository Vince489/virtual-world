import { hash, verify, Algorithm } from '@node-rs/argon2';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import winston from 'winston';

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

const argon2Options = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 threads
  algorithm: Algorithm.Argon2id,    // Use the id variant
};

// Password strength validation
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < minLength) {
    return 'Password must be at least 8 characters long';
  }
  if (!hasUpperCase) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!hasLowerCase) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!hasNumbers) {
    return 'Password must contain at least one number';
  }
  if (!hasSpecialChar) {
    return 'Password must contain at least one special character';
  }
  return null; // Valid
};

// Generate JWT tokens
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: process.env.REFRESH_TOKEN_EXPIRE });
};

export const signup = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      logger.warn('Signup attempt with missing fields', { username, email, ip: req.ip });
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      logger.warn('Signup attempt with weak password', { username, email, ip: req.ip });
      return res.status(400).json({ message: passwordError });
    }

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      logger.warn('Signup attempt with existing username or email', { username, email, ip: req.ip });
      return res.status(409).json({ message: 'Username or email already exists' });
    }

    const hashedPassword = await hash(password, argon2Options);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({ message: 'User created successfully' });
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

    const isValidPassword = await verify(user.password, password, argon2Options);
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

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

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

    logger.info(`Successful login for user: ${username}`, { ip: req.ip });
    res.json({ message: 'Login successful' });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
