import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import winston from 'winston';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';

const app = express();

const PORT = process.env.PORT;

// Configure Winston logger
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

// Configure Morgan for HTTP request logging
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'logs/access.log'),
  { flags: 'a' }
);

app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('dev')); // Log to console in development

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again in 15 minutes.',
});

app.use(limiter);

// Auth routes with stricter rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
});

// Logging middleware for security events
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// Note: express-rate-limit doesn't emit events for logging in this version

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World');
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message} - Stack: ${err.stack}`);
  res.status(500).json({ message: 'Internal server error' });
});

app.use('/auth', authRoutes);

connectDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
