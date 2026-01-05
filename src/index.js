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

// CRITICAL: Trust the reverse proxy headers (X-Forwarded-For)
// This ensures req.ip represents the actual user, not the load balancer.
app.set('trust proxy', 1);

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

// Create rate limiter instances once at boot
let redisAuth, redisGeneral, memoryAuth, memoryGeneral;

// Always create memory-based limiters as fallback
memoryAuth = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // More restrictive when using memory
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts, please try again later.',
});
memoryGeneral = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // More restrictive when using memory
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again in 15 minutes.',
});

// Function to initialize Redis-based limiters
const initializeRedisLimiters = async () => {
  if (isRedisHealthy) {
    try {
      const { RedisStore } = await import('rate-limit-redis');
      redisAuth = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // limit each IP to 5 auth requests per windowMs
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        }),
        message: 'Too many authentication attempts, please try again later.',
      });
      redisGeneral = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        }),
        message: 'Too many requests from this IP, please try again in 15 minutes.',
      });
    } catch (error) {
      console.error('Failed to create Redis-based rate limiter, falling back to memory:', error);
    }
  }
};

// Function to get the appropriate limiter based on Redis health
const getRateLimiter = (isAuthRoute = false) => {
  return (req, res, next) => {
    // Skip general limiter for auth routes to avoid ERR_ERL_DOUBLE_COUNT
    if (!isAuthRoute && req.path.startsWith('/auth')) return next();

    // Use the health check to decide which ALREADY CREATED instance to use
    const limiter = isRedisHealthy && redisAuth && redisGeneral
      ? (isAuthRoute ? redisAuth : redisGeneral)
      : (isAuthRoute ? memoryAuth : memoryGeneral);

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

// Initialize Redis-based limiters before starting the server
await initializeRedisLimiters();

connectDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
