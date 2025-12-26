import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection pooling
      maxPoolSize: 10, // Maximum number of connections in the connection pool
      minPoolSize: 2,  // Minimum number of connections in the connection pool

      // Timeouts
      serverSelectionTimeoutMS: 5000, // How long to wait for server selection
      socketTimeoutMS: 45000, // How long to wait for socket operations
      connectTimeoutMS: 10000, // How long to wait for initial connection

      // Security - enable SSL in production
      ssl: process.env.NODE_ENV === 'production',

      // Other options
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      family: 4 // Use IPv4, skip trying IPv6
    });

    // Disable mongoose buffering globally
    mongoose.set('bufferCommands', false);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Connection pool size: ${conn.connections.length}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
