import { hash, verify, Algorithm } from '@node-rs/argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createHash } from 'crypto';

// Password strength validation
export const validatePasswordStrength = (password) => {
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

// Generate a secure random token for password reset
export const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate JWT tokens
export const generateAccessToken = (userId, tokenVersion) => {
  return jwt.sign(
    { sub: userId, tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

export const generateRefreshToken = (userId, tokenVersion) => {
  const token = jwt.sign(
    { sub: userId, tokenVersion },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRE }
  );
  return { token, hash: generateTokenHash(token) };
};

// Generate a hash of a token for storage
export const generateTokenHash = (token) => {
  return createHash('sha256').update(token).digest('hex');
};

// Hash password
export const hashPassword = async (password) => {
  const argon2Options = {
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4,    // 4 threads
    algorithm: Algorithm.Argon2id,    // Use the id variant
  };
  return await hash(password, argon2Options);
};

// Verify password
export const verifyPassword = async (hashedPassword, password) => {
  const argon2Options = {
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4,    // 4 threads
    algorithm: Algorithm.Argon2id,    // Use the id variant
  };
  return await verify(hashedPassword, password, argon2Options);
};
