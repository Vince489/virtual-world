import nodemailer from 'nodemailer';
import winston from 'winston';

// Configure logger
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

// Create transporter for sending emails
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true' || false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || 'your-email@example.com',
    pass: process.env.EMAIL_PASSWORD || 'your-email-password'
  }
});

// Email template for password reset
const getPasswordResetEmailTemplate = (resetUrl) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>We received a request to reset your password. Click the button below to reset it:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Reset Password
        </a>
      </p>
      <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
      <p>This link will expire in 1 hour for security reasons.</p>
      <p style="font-size: 0.8em; color: #666; margin-top: 30px;">
        If you're having trouble clicking the button, copy and paste the following URL into your browser:<br>
        <a href="${resetUrl}">${resetUrl}</a>
      </p>
    </div>
  `;
};

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetUrl - URL for password reset
 * @returns {Promise<boolean>} - True if email was sent successfully
 */
export const sendPasswordResetEmail = async (to, resetUrl) => {
  try {
    // Email options
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Virtual World" <noreply@virtualworld.com>',
      to,
      subject: 'Password Reset Request',
      html: getPasswordResetEmailTemplate(resetUrl),
      text: `Password Reset Request\n\nWe received a request to reset your password. Please visit this URL to reset it:\n${resetUrl}\n\nIf you didn't request a password reset, please ignore this email.\n\nThis link will expire in 1 hour for security reasons.`
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    logger.info(`Password reset email sent to ${to}`, {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    });

    return true;
  } catch (error) {
    logger.error('Error sending password reset email:', error);
    return false;
  }
};

// Test email connection
export const testEmailConnection = async () => {
  try {
    await transporter.verify();
    logger.info('Email connection test successful');
    return true;
  } catch (error) {
    logger.error('Email connection test failed:', error);
    return false;
  }
};
