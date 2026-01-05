import { z } from 'zod';

// Define the schema for environment variables
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters long'),
  JWT_EXPIRE: z.string().default('1h'),
  REFRESH_TOKEN_EXPIRE: z.string().default('7d'),
  FRONTEND_URL: z.string().url().optional(),
  MONGODB_URI: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
});

// Validate environment variables
export const validateEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  return result.data;
};
