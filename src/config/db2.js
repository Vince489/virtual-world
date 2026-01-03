import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

// Global Mongoose Config
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true); // Recommended for Mongoose 7+

const connectDB = async () => {
  // Check if we already have a connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    // Event Listeners
    mongoose.connection.on('connected', () => console.log('✅ MongoDB: Connected to Cluster'));
    mongoose.connection.on('error', (err) => console.error(`❌ MongoDB: Connection error: ${err}`));
    mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB: Disconnected'));

    const conn = await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // In Mongoose 6+, ssl is usually inferred from the connection string (mongodb+srv)
      // but keeping it explicit for non-srv strings is fine.
      ssl: process.env.NODE_ENV === 'production',
    });

    console.log(`🚀 MongoDB Host: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('💥 MongoDB connection failed:', error.message);
    // Instead of exiting immediately, you could implement a retry logic here
    process.exit(1);
  }
};

// Graceful Shutdown Handler
const closeConnection = async (signal) => {
  console.log(`\nReceived ${signal}. Closing MongoDB connection...`);
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
};

process.on('SIGINT', () => closeConnection('SIGINT'));
process.on('SIGTERM', () => closeConnection('SIGTERM'));

export default connectDB;