import 'dotenv/config';
import winston from 'winston';

// Configure Winston logger for testing
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ]
});

// Only add file logging if we are NOT in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.File({ filename: 'logs/test-error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/test-combined.log' }));
}

// Test logging
logger.debug('This is a debug message');
logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');

console.log('Logging test completed.');
