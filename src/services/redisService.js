import { createClient } from 'redis';
import winston from 'winston';

// Create Redis client for tracking used refresh tokens
const redisClient = createClient({
  url: 'redis://localhost:6379'
});

// Enhanced Redis connection with retry logic
async function connectRedisWithRetry(maxRetries = 3, retryDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await redisClient.connect();
      logger.info('Successfully connected to Redis');
      return true;
    } catch (error) {
      logger.warn(`Redis connection attempt ${i + 1} failed: ${error.message}`);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  logger.error('Failed to connect to Redis after multiple attempts');
  return false;
}

// Circuit Breaker for Redis operations
class RedisCircuitBreaker {
  constructor() {
    this.state = 'CLOSED';
    this.failureThreshold = 3;
    this.failureCount = 0;
    this.resetTimeout = 30000; // 30 seconds
    this.nextAttempt = 0;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker open - Redis unavailable');
      }
      this.state = 'HALF-OPEN';
    }

    try {
      const result = await operation();
      this._reset();
      return result;
    } catch (error) {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this._openCircuit();
      }
      throw error;
    }
  }

  _openCircuit() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.resetTimeout;
    logger.warn('Redis circuit breaker opened');
  }

  _reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
  }
}

const redisBreaker = new RedisCircuitBreaker();

// Set up Redis event listeners for health monitoring
let isRedisHealthy = false;

redisClient.on('error', (err) => {
  isRedisHealthy = false;
  logger.error('Redis connection error', { error: err.message, event: 'redis_error' });
});

redisClient.on('ready', () => {
  isRedisHealthy = true;
  logger.info('Redis connection established');
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis attempting to reconnect');
});

// Connect to Redis with retry
connectRedisWithRetry();

// Export Redis client, breaker, and health status for use in other modules
export { redisClient, redisBreaker, isRedisHealthy };

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
