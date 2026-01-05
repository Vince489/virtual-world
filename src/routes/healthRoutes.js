import express from 'express';
import { redisClient, isRedisHealthy } from '../services/redisService.js';

const router = express.Router();

/**
 * Health check endpoint for Redis
 */
router.get('/health/redis', async (req, res) => {
  try {
    // Try to ping Redis if the connection is open
    if (redisClient.isOpen) {
      await redisClient.ping();
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'Redis connection is healthy'
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        message: 'Redis connection is not open'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      message: 'Redis connection failed',
      error: error.message
    });
  }
});

/**
 * Overall system health check
 */
router.get('/health', async (req, res) => {
  const systemStatus = {
    timestamp: new Date().toISOString(),
    components: {
      redis: {
        status: isRedisHealthy ? 'healthy' : 'unhealthy',
        message: isRedisHealthy ? 'Redis connection is healthy' : 'Redis connection issues detected'
      },
      // Add other components as needed
      database: {
        status: 'healthy', // Would be determined by actual DB check in production
        message: 'Database connection assumed healthy'
      }
    }
  };

  // Determine overall status
  const unhealthyComponents = Object.values(systemStatus.components)
    .filter(component => component.status === 'unhealthy');

  const overallStatus = unhealthyComponents.length > 0 ? 'degraded' : 'healthy';

  res.status(overallStatus === 'healthy' ? 200 : 503).json({
    status: overallStatus,
    ...systemStatus
  });
});

export default router;
