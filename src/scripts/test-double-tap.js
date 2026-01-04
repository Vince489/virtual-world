import { createLogger, transports, format } from 'winston';
import { createClient } from 'redis';
import { setTimeout } from 'timers/promises';

// Initialize the application
async function initialize() {
  // Create a logger for the test script
  const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/test-double-tap.log' })
  ]
});

// Create a Redis client for testing
const redisClient = createClient({
  url: 'redis://localhost:6379'
});

// Connect to Redis
redisClient.connect().catch(console.error);

// Import http module at the top level
const http = await import('http');

// Function to make HTTP requests with cookie handling
async function makeRequest(method, path, cookies = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3080,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': Object.entries(cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ')
      }
    };
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // Parse cookies from response
        const responseCookies = {};
        if (res.headers['set-cookie']) {
          res.headers['set-cookie'].forEach(cookie => {
            const parsed = {};
            const cookieStr = cookie.split(';')[0];
            const [name, value] = cookieStr.split('=');
            if (name && value) {
              parsed[name] = decodeURIComponent(value);
            }
            Object.assign(responseCookies, parsed);
          });
        }

        try {
          const jsonData = data ? JSON.parse(data) : null;
          resolve({
            statusCode: res.statusCode,
            data: jsonData,
            cookies: responseCookies
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: data,
            cookies: responseCookies
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Main test function
async function testDoubleTap() {
  try {
    logger.info('Starting Double-Tap test...');

    // Step 1: Login to get a valid refresh token
    logger.info('Step 1: Logging in to get a valid refresh token...');
    const loginResponse = await makeRequest('POST', '/auth/login', {}, {
      username: 'testuser',
      password: 'Test@1234'
    });

    if (loginResponse.statusCode !== 200) {
      logger.error('Login failed:', loginResponse.data);
      return;
    }

    logger.info('Login successful');

    // Extract cookies from the response
    const cookies = loginResponse.cookies;
    logger.info('Cookies received from login:', cookies);

    const refreshToken = cookies.refreshToken;

    if (!refreshToken) {
      logger.error('No refresh token received');
      logger.error('Available cookies:', cookies);
      return;
    }

    logger.info('Refresh token obtained');

    // Step 2: First call to refresh token endpoint
    logger.info('Step 2: Making first call to /auth/refresh-token...');
    const firstRefreshResponse = await makeRequest('POST', '/auth/refresh-token', cookies);

    if (firstRefreshResponse.statusCode !== 200) {
      logger.error('First refresh token call failed:', firstRefreshResponse.data);
      return;
    }

    logger.info('First refresh token call successful');

    // Get the new refresh token from the first response
    const newRefreshToken = firstRefreshResponse.cookies.refreshToken;

    // Step 3: Second call to refresh token endpoint with the same token (within leeway window)
    logger.info('Step 3: Making second call to /auth/refresh-token with the same token...');

    // Use the original cookies for the second call
    const secondRefreshResponse = await makeRequest('POST', '/auth/refresh-token', cookies);

    if (secondRefreshResponse.statusCode === 200) {
      logger.info('SUCCESS: Second refresh token call within leeway window was successful');
      logger.info('This indicates the leeway window is working correctly');
    } else {
      logger.error('Second refresh token call failed:', secondRefreshResponse.data);
    }

    // Step 4: Check Redis for the leeway window log
    logger.info('Step 4: Checking Redis for leeway window logs...');
    const usedTokenKey = `usedRefreshToken:${refreshToken}`;
    const isTokenUsed = await redisClient.get(usedTokenKey);
    const isRecentReuse = await redisClient.get(`${usedTokenKey}:leeway`);

    if (isRecentReuse) {
      logger.info('SUCCESS: Found leeway window marker in Redis');
      logger.info('This confirms the token was reused within the leeway window');
    } else {
      logger.warn('No leeway window marker found in Redis');
    }

    // Step 5: Wait for leeway window to expire and try again
    logger.info('Step 5: Waiting for leeway window to expire (30 seconds)...');
    await setTimeout(31000); // Wait 31 seconds to ensure leeway window has expired

    logger.info('Making third call to /auth/refresh-token with the same token (after leeway window)...');
    const thirdRefreshResponse = await makeRequest('POST', '/auth/refresh-token', cookies);

    if (thirdRefreshResponse.statusCode === 401) {
      logger.info('SUCCESS: Third refresh token call after leeway window was rejected with 401');
      logger.info('This confirms the leeway window protection is working correctly');
    } else {
      logger.error('Third refresh token call should have failed with 401:', thirdRefreshResponse.data);
    }

    logger.info('Double-Tap test completed');

  } catch (error) {
    logger.error('Error during Double-Tap test:', error);
  } finally {
    // Disconnect from Redis
    await redisClient.quit();
  }
}

  // Run the test
  await testDoubleTap();
}
initialize().catch(console.error);
