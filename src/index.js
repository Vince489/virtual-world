import 'dotenv/config';
import express from 'express';
import { validateEnv } from './config/validateEnv.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import winston from 'winston';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { redisClient, isRedisHealthy } from './services/redisService.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Validate environment variables
validateEnv();

const PORT = process.env.PORT;
// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Always log to the console (Railway captures this)
    new winston.transports.Console(),
  ]
});

// Only add file logging if we are NOT in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}

// Configure Morgan for HTTP request logging
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only log to file in development
if (process.env.NODE_ENV !== 'production') {
  const accessLogStream = fs.createWriteStream(
    path.join(__dirname, 'logs/access.log'),
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
}

// Log to console in development
app.use(morgan('dev'));

// Cookie parser middleware
app.use(cookieParser());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use(helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }));
}

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000'], // Add your trusted domains here
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  credentials: true
}));

// Function to get the appropriate limiter based on Redis health
const getRateLimiter = (isAuthRoute = false) => {
  return async (req, res, next) => {
    let limiter;

    // Check Redis health dynamically on every request
    if (isRedisHealthy) {
      try {
        const { RedisStore } = await import('rate-limit-redis');

if (isAuthRoute) {
          limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // limit each IP to 5 auth requests per windowMs
            standardHeaders: true,
            legacyHeaders: false,
            store: new RedisStore({
              sendCommand: (...args) => redisClient.sendCommand(args),
            }),
            message: 'Too many authentication attempts, please try again later.',
          });
        } else {
          limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            standardHeaders: true,
            legacyHeaders: false,
            store: new RedisStore({
              sendCommand: (...args) => redisClient.sendCommand(args),
            }),
            message: 'Too many requests from this IP, please try again in 15 minutes.',
          });
        }
      } catch (error) {
        console.error('Failed to create Redis-based rate limiter, falling back to memory:', error);
      }
    }

    // Fallback to memory-based limiter if Redis is not healthy
    if (!limiter) {
if (isAuthRoute) {
        limiter = rateLimit({
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 3, // More restrictive when using memory
          standardHeaders: true,
          legacyHeaders: false,
          message: 'Too many authentication attempts, please try again later.',
        });
      } else {
        limiter = rateLimit({
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 50, // More restrictive when using memory
          standardHeaders: true,
          legacyHeaders: false,
          message: 'Too many requests from this IP, please try again in 15 minutes.',
        });
      }
    }

    return limiter(req, res, next);
  };
};

// Logging middleware for security events
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// Auth routes with stricter rate limiting
const authLimiter = getRateLimiter(true);

// Note: express-rate-limit doesn't emit events for logging in this version

app.use(express.json({ limit: '10kb' }));

app.get('/', (req, res) => {
  res.send('Hello World');
});

// Error handling middleware
app.use(errorHandler);

app.use('/auth', authLimiter, authRoutes);
app.use('/health', healthRoutes);

connectDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
