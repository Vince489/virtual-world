# Refresh Token Rotation Explanation

This project implements a robust refresh token rotation mechanism for enhanced security. Here's how it works:

## Core Components

1. **Token Versioning**: Each user has a `tokenVersion` field in their database record (default: 0)
2. **Redis Tracking**: Used refresh tokens are stored in Redis with their remaining lifetime
3. **Token Expiration**: Access tokens expire in 1 hour, refresh tokens expire in 7 days

## How Refresh Token Rotation Works

### 1. Initial Login
- When a user logs in, both access and refresh tokens are generated with the current `tokenVersion`
- Both tokens are stored in HTTP-only cookies
- The refresh token contains the user ID and token version in its payload

### 2. Token Refresh Process
When a user requests to refresh their access token:

1. The refresh token is verified and decoded
2. The system checks Redis to see if this refresh token has been used before
   - If it has been used outside a 30-second leeway window, it's considered a potential breach
   - The user's `tokenVersion` is incremented, invalidating all existing tokens
   - The user must log in again

3. If the token is valid and not previously used:
   - A new access token is generated with the current `tokenVersion`
   - A new refresh token is generated (rotation)
   - The old refresh token is marked as used in Redis with its remaining lifetime
   - A 30-second leeway window is set to allow for minor network delays

### 3. Security Features

- **Token Version Mismatch Protection**: If a refresh token is presented with an outdated `tokenVersion`, it's rejected
- **Refresh Token Reuse Detection**: Any attempt to reuse a refresh token (outside the 30-second window) triggers:
  - Immediate increment of the user's `tokenVersion`
  - Invalidation of all existing tokens for that user
  - Forced re-authentication

- **Password/Token Version Changes**: When a user:
  - Updates their password
  - Logs out from all devices
  - Resets their password
  The `tokenVersion` is incremented, invalidating all existing tokens

## Implementation Details

1. **Redis Storage**:
   - Used tokens are stored with key: `usedRefreshToken:{token}`
   - A 30-second leeway window is stored with key: `usedRefreshToken:{token}:leeway`

2. **Token Generation**:
   - Access tokens: 1 hour expiration
   - Refresh tokens: 7 days expiration
   - Both include the user ID and current token version in their payload

3. **Security Headers**:
   - All tokens are stored in HTTP-only, secure (in production) cookies
   - SameSite=strict policy prevents CSRF attacks

## Benefits of This Approach

1. **Limited Exposure Window**: Even if a refresh token is compromised, it can only be used once
2. **Automatic Token Rotation**: Each refresh operation generates a new refresh token
3. **Short-lived Access Tokens**: Access tokens expire quickly (1 hour), reducing risk
4. **Immediate Invalidation**: Changing passwords or logging out from all devices invalidates all tokens
5. **Breach Detection**: Reused refresh tokens trigger security alerts and token invalidation

This implementation follows security best practices by combining token rotation with versioning and reuse detection, providing multiple layers of protection against token theft and replay attacks.