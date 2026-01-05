/**
 * Utility function to mask email addresses for logging purposes
 * to protect PII (Personally Identifiable Information)
 *
 * @param {string} email - The email address to mask
 * @returns {string} - The masked email address
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') {
    return 'invalid-email';
  }

  const [name, domain] = email.split('@');

  // If no @ symbol, return as is (not a valid email)
  if (!domain) {
    return email;
  }

  // Mask the name part while preserving domain
  // For short names (1-3 chars), show first char + **
  // For longer names, show first char + ** + last char
  if (name.length <= 3) {
    return `${name[0]}**@${domain}`;
  } else {
    return `${name[0]}**${name.slice(-1)}@${domain}`;
  }
}

export { maskEmail };
