To protect against **Cross-Site Scripting (XSS)**, you need a multi-layered defense. XSS occurs when an attacker injects malicious scripts into content that is then delivered to another user’s browser.

Here is how to implement the protections you mentioned, along with the industry standards for securing a web application.

---

## 1. Using Helmet.js (Middleware Security)

**Helmet** is a collection of middleware functions for Express.js that sets various HTTP headers to harden your app. For XSS specifically, two headers are critical:

* **Content Security Policy (CSP):** This is the most powerful tool. It tells the browser which sources of scripts, images, and data are trusted. It prevents the execution of "inline" scripts (scripts written directly in HTML) and scripts from untrusted domains.
* **X-XSS-Protection:** An older header that enables the XSS filter built into most modern web browsers.

**Implementation Example:**

```javascript
const express = require('express');
const helmet = require('helmet');
const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "trusted-scripts.com"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": [],
    },
  },
}));

```

---

## 2. Input Sanitization vs. Output Encoding

While "sanitizing" is common, **Output Encoding** is actually the primary defense against XSS.

### Input Sanitization

This involves cleaning the data *before* it reaches your database. You strip out `<script>` tags or dangerous attributes like `onerror`.

* **Tool:** `dompurify` (highly recommended) or `sanitize-html`.
* **Use Case:** When you *must* allow some HTML (like a blog editor with bold/italic tags).

### Output Encoding

This is the process of converting special characters into a "safe" form so the browser treats them as text, not code.

* **Example:** `<` becomes `&lt;` and `>` becomes `&gt;`.
* **Modern Frameworks:** React, Vue, and Angular do this automatically for you unless you use dangerous functions like `dangerouslySetInnerHTML`.

---

## 3. Secure Cookie Management

If an attacker successfully executes a script, their first goal is usually to steal the user's **Session Token**. You can prevent this by setting specific flags on your cookies:

* **HttpOnly:** This prevents JavaScript (and therefore XSS scripts) from accessing the cookie via `document.cookie`.
* **Secure:** Ensures the cookie is only sent over encrypted HTTPS connections.
* **SameSite:** Prevents the cookie from being sent with cross-site requests, mitigating CSRF attacks.

---

## Summary Checklist for XSS Defense

| Strategy | Action | Purpose |
| --- | --- | --- |
| **Headers** | Use `Helmet.js` | Enforce CSP and browser-level security filters. |
| **Sanitize** | Use `DOMPurify` | Strip malicious tags from user-provided HTML. |
| **Encode** | Use Framework Defaults | Convert `<script>` to harmless text on render. |
| **Cookies** | Set `HttpOnly` | Ensure tokens cannot be stolen even if XSS occurs. |
| **Validation** | Use `Joi` or `Zod` | Ensure input matches expected types (e.g., age is a number). |
