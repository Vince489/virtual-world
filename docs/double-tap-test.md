# Double-Tap Test Documentation

## Table of Contents
1. [Introduction](#introduction)
2. [Purpose](#purpose)
3. [Implementation](#implementation)
4. [How to Run the Test](#how-to-run-the-test)
5. [Expected Results](#expected-results)
6. [Troubleshooting](#troubleshooting)

---

## Introduction
This document describes the Double-Tap test script that verifies the leeway window functionality in the refresh token endpoint. The test ensures that the system correctly handles rapid successive requests to the refresh token endpoint.

---

## Purpose
The Double-Tap test is designed to verify that:

1. The refresh token endpoint correctly implements a leeway window (30 seconds)
2. Rapid successive requests within the leeway window are allowed
3. Requests after the leeway window expires are properly rejected
4. The system correctly logs token reuse within the leeway window

This test helps ensure that the system provides a good balance between security and usability, allowing for legitimate rapid successive requests while protecting against token reuse attacks.

---

## Implementation
The test script is located at `src/scripts/test-double-tap.js` and performs the following steps:

1. Logs in to obtain a valid refresh token
2. Makes a first call to the refresh token endpoint
3. Makes a second call to the refresh token endpoint with the same token within the leeway window
4. Waits for the leeway window to expire (30 seconds)
5. Makes a third call to the refresh token endpoint with the same token after the leeway window has expired

The script uses the following technologies:
- Winston for logging
- Redis for checking the leeway window marker
- Node.js HTTP module for making requests

---

## How to Run the Test

### Prerequisites
1. Ensure the server is running: `npm run dev`
2. Ensure Redis is running (it's included in the docker-compose.yml)
3. Ensure the test user is seeded: `npm run seed:test-user`

### Running the Test
Run the test using the following command:
```bash
npm run test:double-tap
```

### Test Scripts in package.json
The following scripts are available in package.json:
```json
"scripts": {
  "test:double-tap": "node src/scripts/test-double-tap.js",
  "seed:test-user": "node src/scripts/seed-test-user.js"
}
```

---

## Expected Results
When the test runs successfully, you should see the following output:

1. Login successful
2. First refresh token call successful
3. Second refresh token call within leeway window successful
4. Leeway window marker found in Redis
5. Third refresh token call after leeway window rejected with 401

The server logs should show:
```
Refresh token reused within leeway window for user: [userId]
```

---

## Troubleshooting

### Common Issues and Solutions

1. **Login fails with "Invalid credentials"**
   - Make sure the test user is properly seeded: `npm run seed:test-user`
   - Check that the credentials in the test script match those in the seed script

2. **Refresh token not provided**
   - Ensure cookie-parser middleware is properly set up in index.js
   - Verify that the cookies are being sent correctly in the test script

3. **Redis connection issues**
   - Make sure Redis is running: `docker-compose up -d redis`
   - Check the Redis connection in the test script

4. **Server not running**
   - Start the server: `npm run dev`
   - Make sure the server is running on port 3080

---

## Conclusion
The Double-Tap test script provides a comprehensive way to verify that the leeway window functionality in the refresh token endpoint is working correctly. This ensures that the system provides a good balance between security and usability, allowing for legitimate rapid successive requests while protecting against token reuse attacks.
