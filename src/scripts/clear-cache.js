import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const clearCache = async () => {
  try {
    const client = createClient({
      url: process.env.REDIS_URL
    });

    client.on('error', (err) => {
      console.error('Redis error:', err);
      process.exit(1);
    });

    await client.connect();
    await client.flushDb();
    console.log('✅ Redis cache cleared successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Cache clearing failed:', err);
    process.exit(1);
  }
};

clearCache();
