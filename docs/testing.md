It makes perfect sense to verify the "Fortress" before moving on. Testing these specific edge cases—especially the **Redis Fallback** and the **Leeway Window**—is what separates a theoretical design from a reliable production system.

Here is a structured testing guide you can use with a tool like **Postman**, **Insomnia**, or **cURL** to verify the work you've done.

---

## 1. Testing the "Circuit Breaker" (Redis Fallback)

This verifies that your website stays alive even if your infrastructure fails.

* **Step A:** Log in to get a valid `accessToken` cookie.
* **Step B:** Stop your Redis container: `docker stop redis`.
* **Step C:** Access a protected route (e.g., `/auth/logout-all`).
* **Expected Result:** The request should succeed. Your console should show the warning: `"Redis Down - Falling back to MongoDB"`.
* **Step D:** Restart Redis: `docker start redis`. Access the route again.
* **Expected Result:** The request should succeed, and Redis should automatically re-populate the cache.

---

## 2. Testing the "Leeway Window" (Double-Tap Protection)

This verifies that legitimate users aren't accidentally logged out by network glitches.

* **Step A:** Trigger a token refresh at `/auth/refresh-token`.
* **Step B:** Immediately (within 1–5 seconds) send the **exact same** refresh request again.
* **Expected Result:** The second request should succeed with a log entry: `"Refresh token reused within leeway window"`.
* **Step C:** Wait 31 seconds and send that same old token a third time.
* **Expected Result:** **401 Unauthorized**. You should see the high-severity log: `"CRITICAL: Refresh token reuse detected... Potential security breach!"`.

**Automated Test:** For a more comprehensive test, you can use the Double-Tap test script located at `src/scripts/test-double-tap.js`. This script automates the entire process and verifies the leeway window functionality. To run the test, use the command:

```bash
npm run test:double-tap
```

For more information about the Double-Tap test script, see [Double-Tap Test Documentation](double-tap-test.md).

---

## 3. Testing "Atomic Invalidation" (Real-time Revocation)

This confirms that logging out from "all devices" actually works across the cache and DB.

* **Step A:** Log in on two different "sessions" (e.g., a browser and a REST client).
* **Step B:** Call `/auth/logout-all` from the REST client.
* **Step C:** Try to use the `accessToken` from the **browser** session.
* **Expected Result:** **401 Unauthorized**. Because you deleted the Redis key and incremented the DB version, the middleware will detect the version mismatch immediately.

---

## 4. Verifying the Frontend Payload

Ensure your UI has what it needs to function without reading secure cookies.

* **Step A:** Perform a `signup` and a `login`.
* **Expected Result:** The JSON response body should contain the `user` object with `id`, `username`, and `email`, but **never** the `password` or `tokenVersion`.

---

**Would you like me to provide a specialized testing script (using Node.js or shell) to automate these "Double-Tap" and "Fallback" tests for you?**
