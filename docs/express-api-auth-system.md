# Express API Backend and Authentication System

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Authentication System](#authentication-system)
   - [User Model](#user-model)
   - [Password Hashing](#password-hashing)
   - [JWT Tokens](#jwt-tokens)
   - [Login and Signup](#login-and-signup)
   - [Secure Cookies](#secure-cookies)
   - [Token Version Verification](#token-version-verification)
   - [Hybrid Logout Approach](#hybrid-logout-approach)
   - [Redis Caching](#redis-caching)
   - [Refresh Token Rotation](#refresh-token-rotation)
4. [Security Enhancements](#security-enhancements)
   - [Input Validation](#input-validation)
   - [NoSQL Injection Prevention](#nosql-injection-prevention)
   - [Database Security](#database-security)
   - [Logging and Monitoring](#logging-and-monitoring)
   - [Dependency Security](#dependency-security)
   - [Error Handling](#error-handling)
   - [API Security](#api-security)
   - [Secure Cookie Configuration](#secure-cookie-configuration)
   - [Security Headers](#security-headers)
5. [Middleware and Utilities](#middleware-and-utilities)
   - [Helmet](#helmet)
   - [CORS](#cors)
   - [Rate Limiting](#rate-limiting)
   - [HTTPS Enforcement](#https-enforcement)
6. [Environment Variables](#environment-variables)
7. [Conclusion](#conclusion)

---

## Introduction
This document provides a comprehensive overview of the Express API backend and authentication system. The system is designed with security best practices in mind, including input validation, secure authentication, and protection against common vulnerabilities.

---

## Project Structure
```
.
├── src/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   └── authController.js
│   ├── middleware/
│   │   └── verifyTokenVersion.js
│   ├── models/
│   │   └── User.js
│   ├── routes/
│   │   └── authRoutes.js
│   ├── index.js
│   └── public/
├── docs/
│   ├── auth.md
│   ├── db-safety.md
│   ├── domPurify.md
│   ├── security-implementation-plan.md
│   ├── work-done.md
│   ├── xss.md
│   └── express-api-auth-system.md
├── docker-compose.yml
├── package.json
├── package-lock.json
└── .gitignore
```

---

## Authentication System

### User Model
The `User` model is defined in `src/models/User.js` and includes:
- **Schema Validation**: Ensures data integrity and prevents NoSQL injection.
- **Password Hashing**: Uses Argon2 for secure password storage.
- **Login Attempts Tracking**: Monitors failed login attempts and locks accounts after too many failures.
- **Token Versioning**: Implements token versioning for secure logout from all devices.

**Schema Fields:**
```javascript
const userSchema = new mongoose.Schema({
  username: { /* ... */ },
  email: { /* ... */ },
  password: { /* ... */ },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  tokenVersion: { type: Number, default: 0 } // For token versioning
});
```

### Password Hashing
- **Algorithm**: Argon2id (memory-hard, resistant to brute-force attacks).
- **Configuration**:
  ```javascript
  const argon2Options = {
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4,    // 4 threads
    algorithm: Algorithm.Argon2id, // Use the id variant
  };
  ```

### JWT Tokens
- **Access Token**: Short-lived (15 minutes) for API access.
- **Refresh Token**: Long-lived (7 days) for obtaining new access tokens.
- **Token Versioning**: Implements token versioning for secure logout from all devices.
- **Refresh Token Rotation**: Enhances security by rotating refresh tokens on each use, mitigating the risk of token theft.
- **Generation**:
  ```javascript
  const generateAccessToken = (userId, tokenVersion) => {
    return jwt.sign(
      { userId, tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
  };
  ```

- **Token Version Strategy**: Each user has a tokenVersion field that is incremented when logging out from all devices, invalidating all existing tokens.
- **Refresh Token Endpoint**: `/auth/refresh-token` allows obtaining a new access token using a valid refresh token, and implements refresh token rotation for enhanced security.
- **Refresh Token Rotation**: When a refresh token is used, a new refresh token is issued, and the old one is marked as used in Redis. If a refresh token is reused (potential breach), the system detects it and invalidates all tokens for that user.
- **Logout Endpoints**:
  - `/auth/logout` - Public route for clearing cookies (no authentication required)
  - `/auth/logout-all` - Protected route for logging out from all devices by incrementing token version

### Login and Signup
- **Signup**: Validates input, checks for existing users, and hashes passwords.
- **Login**: Validates credentials, checks for locked accounts, and issues tokens.
- **Password Strength**: Enforces minimum requirements (8+ characters, uppercase, lowercase, number, special character).

### Secure Cookies
- **Attributes**:
  - `HttpOnly`: Prevents JavaScript access.
  - `Secure`: Ensures cookies are only sent over HTTPS.
  - `SameSite`: Prevents CSRF attacks.
- **Configuration**:
  ```javascript
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000 // 1 hour
  });
  ```

### Token Version Verification
- **Purpose**: Verifies that the token version in the JWT matches the user's current token version in the database.
- **Implementation**: Middleware that checks token version before allowing access to protected routes.
- **Optimizations**:
  - Uses Redis caching to reduce database load
  - Fetches only the `tokenVersion` field from the database when needed
  - Caches token versions for 5 minutes to improve performance
  - Only attaches the user ID to the request object, avoiding unnecessary database queries
  - Provides a utility function to fetch the full user object when needed in specific routes
- **Code**:
  ```javascript
  export const verifyTokenVersion = async (req, res, next) => {
    try {
      const token = req.cookies.accessToken;
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check Redis cache first
      const cachedTokenVersion = await redisClient.get(`tokenVersion:${decoded.userId}`);

      let userTokenVersion;

      if (cachedTokenVersion) {
        // Use cached token version
        userTokenVersion = parseInt(cachedTokenVersion);
      } else {
        // Fetch from database if not in cache (only tokenVersion field)
        const user = await User.findById(decoded.userId).select('tokenVersion');

        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }

        userTokenVersion = user.tokenVersion;

        // Cache the token version for 5 minutes
        await redisClient.set(`tokenVersion:${decoded.userId}`, userTokenVersion.toString(), {
          EX: 300 // 5 minutes in seconds
        });
      }

      if (decoded.tokenVersion !== userTokenVersion) {
        return res.status(401).json({ message: 'Token version mismatch - please login again' });
      }

      // Attach decoded user info to request for use in subsequent middleware
      // Only the userId is attached by default to avoid unnecessary database queries
      req.userId = decoded.userId;

      next();
    } catch (error) {
      // Error handling...
    }
  };
  ```

- **Utility Function**: For routes that need the full user object, a utility function is provided:
  ```javascript
  export const getUserById = async (userId) => {
    return await User.findById(userId);
  };
  ```

### Hybrid Logout Approach
- **Purpose**: Provides a balance between security and usability for logout functionality.
- **Implementation**:
  - **Public Logout Route**: `/auth/logout` is public and only clears cookies, allowing users to logout even with expired tokens.
  - **Protected Logout-All Route**: `/auth/logout-all` is protected and increments the token version, invalidating all tokens across devices.
- **Benefits**:
  - Users can always clear their cookies, even with expired tokens
  - Sensitive operations (like invalidating all sessions) remain protected
  - Frontend can handle both scenarios gracefully

### Profile Route (Example)
- **Purpose**: Demonstrates how to fetch the full user object when needed in specific routes.
- **Implementation**:
  - Uses the `verifyTokenVersion` middleware to verify the token
  - Uses the `getUserById` utility function to fetch the full user object only when needed
  - Returns user profile data while excluding sensitive information
- **Code**:
  ```javascript
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
  ```
- **Benefits**:
  - Avoids unnecessary database queries in the middleware
  - Only fetches the full user object when actually needed
  - Demonstrates the proper way to use the utility function

### Redis Caching
- **Purpose**: Improves performance by caching token versions in Redis, reducing database load.
- **Implementation**:
  - Redis is used to cache user token versions with a 5-minute TTL
  - The `verifyTokenVersion` middleware first checks Redis for the token version
  - If not found in Redis, it fetches from the database and caches the result
  - This significantly reduces database queries for token version verification
- **Benefits**:
  - Improved performance by reducing database load
  - Maintains security while enhancing scalability
  - Automatic cache invalidation after 5 minutes ensures data consistency

### Refresh Token Rotation
- **Purpose**: Enhances security by rotating refresh tokens on each use, mitigating the risk of token theft.
- **Implementation**:
  - When a refresh token is used to obtain a new access token, a new refresh token is issued
  - The old refresh token is marked as used in Redis
  - If a refresh token is reused (potential breach), the system detects it and invalidates all tokens for that user
  - The token version is incremented to force logout from all devices
  - Token reuse is logged as a "CRITICAL" severity event with "high" severity flag
- **Benefits**:
  - Mitigates the risk of refresh token theft
  - Detects and responds to potential security breaches
  - Provides an additional layer of security for long-lived tokens
  - Enables monitoring for coordinated attacks through high-severity logging

---

## Security Enhancements

### Input Validation
- **Schema Validation**: Mongoose enforces data types and required fields.
- **Password Validation**: Custom function checks for strong passwords.

### NoSQL Injection Prevention
- **Mongoose**: Automatically sanitizes input and prevents NoSQL injection.
- **Strict Schema**: Ensures only valid data is saved.

### Database Security
- **TLS/SSL**: Encrypts database connections.
- **Connection Pooling**: Manages database connections efficiently.
- **Environment Variables**: Securely stores credentials.

### Logging and Monitoring
- **Winston**: Logs errors and security events to files.
- **Morgan**: Logs HTTP requests for monitoring.

### Dependency Security
- **npm audit**: Regularly audits dependencies for vulnerabilities.
- **Automated Fixes**: Updates vulnerable packages.

### Error Handling
- **Generic Messages**: Avoids exposing sensitive information.
- **Logging**: Detailed errors are logged for debugging.

### API Security
- **CORS**: Restricts API access to trusted domains.
- **HTTPS**: Enforced in production using HSTS.

### Secure Cookie Configuration
- **HttpOnly, Secure, SameSite**: Protects cookies from theft and CSRF.

### Security Headers
- **Helmet**: Sets secure HTTP headers (CSP, HSTS, XSS protection, etc.).

### Request Body Size Limiting
- **Purpose**: Prevents denial-of-service (DoS) attacks by limiting the size of incoming request bodies.
- **Configuration**:
  ```javascript
  app.use(express.json({ limit: '10kb' }));
  ```

### Redis Security
- **Purpose**: Enhances security by using Redis for caching and token tracking.
- **Implementation**:
  - Redis is used to cache token versions, reducing database load
  - Redis tracks used refresh tokens to detect potential breaches
  - Redis connection is secured and properly managed
- **Benefits**:
  - Improves performance while maintaining security
  - Detects and responds to potential security breaches
  - Provides an additional layer of security for token management

---

## Middleware and Utilities

### Helmet
- **Purpose**: Sets secure HTTP headers.
- **Configuration**:
  ```javascript
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
  ```

### CORS
- **Purpose**: Restricts API access to trusted domains.
- **Configuration**:
  ```javascript
  app.use(cors({
    origin: ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  ```

### Rate Limiting
- **Purpose**: Prevents brute-force attacks.
- **Configuration**:
  ```javascript
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  });
  ```

### HTTPS Enforcement
- **Purpose**: Ensures secure communication.
- **Configuration**:
  ```javascript
  if (process.env.NODE_ENV === 'production') {
    app.use(helmet.hsts({
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    }));
  }
  ```

### Redis
- **Purpose**: Provides in-memory caching for token versions and refresh token tracking.
- **Implementation**:
  - Docker container running Redis for development
  - Redis client integrated with the application
  - Used for caching token versions and tracking used refresh tokens
- **Configuration**:
  ```javascript
  const redisClient = createClient({
    url: 'redis://localhost:6379'
  });

  // Connect to Redis
  redisClient.connect().catch(console.error);
  ```
- **Docker Configuration**:
  ```yaml
  version: '3.8'

  services:
    redis:
      image: redis:alpine
      container_name: redis
      ports:
        - "6379:6379"
      volumes:
        - redis_data:/data
      restart: unless-stopped

  volumes:
    redis_data:
  ```

---

## Environment Variables
- **Required Variables**:
  - `PORT`: Server port.
  - `MONGODB_URI`: Database connection string.
  - `JWT_SECRET`: Secret for JWT tokens.
  - `JWT_EXPIRE`: Expiration time for access tokens.
  - `REFRESH_TOKEN_SECRET`: Secret for refresh tokens.
  - `REFRESH_TOKEN_EXPIRE`: Expiration time for refresh tokens.
  - `NODE_ENV`: Environment (development/production).
  - `REDIS_URL`: Redis connection URL (default: redis://localhost:6379).

---

## Conclusion
This Express API backend and authentication system is designed with security as a top priority. It includes robust authentication, input validation, secure database interactions, and comprehensive logging.

The system now features:
- **Redis Caching**: Improves performance by caching token versions, reducing database load and enhancing scalability.
- **Refresh Token Rotation**: Enhances security by rotating refresh tokens on each use, mitigating the risk of token theft and detecting potential breaches.

These improvements make the system even more secure and efficient, addressing the areas for improvement mentioned in the review.

## Final Deployment Pro-Tips
As you move toward production, keep these three final operational tips in mind:

1. **Redis Persistence**: Ensure your Docker volume for Redis is correctly mapped (as you have in your YAML), so that if the container restarts, you don't accidentally log everyone out (since the cached versions would be lost and the system would fall back to the DB).

2. **Monitoring (The "Silent" Breach)**: Since you now have logic to detect Refresh Token reuse, make sure you log this as a "High" or "Critical" severity event in Winston. If your logs show multiple "Token Reuse Detected" events for different users, you'll know immediately that your app is under a coordinated attack.

3. **Secret Management**: For production, ensure JWT_SECRET and REFRESH_TOKEN_SECRET are long, random strings (at least 64 characters) and are never hardcoded in your index.js.

The system is now ready for production deployment with minimal additional configuration.
