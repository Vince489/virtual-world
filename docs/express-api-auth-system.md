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
- **Refresh Token Endpoint**: `/auth/refresh-token` allows obtaining a new access token using a valid refresh token.
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
- **Code**:
  ```javascript
  export const verifyTokenVersion = async (req, res, next) => {
    try {
      const token = req.cookies.accessToken;
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (decoded.tokenVersion !== user.tokenVersion) {
        return res.status(401).json({ message: 'Token version mismatch - please login again' });
      }

      req.user = user;
      next();
    } catch (error) {
      // Error handling...
    }
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

---

## Conclusion
This Express API backend and authentication system is designed with security as a top priority. It includes robust authentication, input validation, secure database interactions, and comprehensive logging. The system is ready for production deployment with minimal additional configuration.
