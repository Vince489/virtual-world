import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000; // 5 seconds
let monitorInterval = null; // Store interval globally to prevent zombies

// 1. Move Listeners OUTSIDE the function so they only attach ONCE
mongoose.connection.on('connected', () => console.log('✅ Mongoose connected to DB Cluster'));
mongoose.connection.on('error', (err) => console.error(`❌ Mongoose connection error: ${err}`));
mongoose.connection.on('disconnected', () => console.log('⚠️ Mongoose disconnected'));
mongoose.connection.on('poolReady', () => console.log('🏊 Pool Ready'));

const connectDB = async () => {
  // 2. Prevent "Double-Connecting" zombies
  if (mongoose.connection.readyState === 1) return;

  mongoose.set('bufferCommands', false);

  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        ssl: process.env.NODE_ENV === 'production',
        maxIdleTimeMS: 30000
      });

      // 3. Clear existing interval before starting a new one (Harden against Interval Zombies)
      if (monitorInterval) clearInterval(monitorInterval);

      const admin = mongoose.connection.getClient().db('admin').admin();
      monitorInterval = setInterval(async () => {
        try {
          if (mongoose.connection.readyState === 1) {
            const status = await admin.serverStatus();
            console.log(`📊 Active: ${status.connections.current} | Available: ${status.connections.available}`);
          }
        } catch (e) {
          // If admin command fails (e.g. permission), kill the zombie interval
          clearInterval(monitorInterval);
        }
      }, 30000);

      return;
    } catch (error) {
      retryCount++;
      console.error(`Attempt ${retryCount} failed.`);
      if (retryCount >= MAX_RETRIES) process.exit(1);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

// 4. Harden the Shutdown logic
const gracefulExit = async () => {
  console.log('Closing Mongoose connection...');
  if (monitorInterval) clearInterval(monitorInterval); // Kill the interval zombie
  await mongoose.connection.close();
  process.exit(0);
};

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);

export default connectDB;
