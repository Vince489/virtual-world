import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const migrateData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Example migration: Add a new field to all users
    await User.updateMany(
      { newField: { $exists: false } },
      { $set: { newField: 'defaultValue' } }
    );

    console.log('✅ Data migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Data migration failed:', err);
    process.exit(1);
  }
};

migrateData();
