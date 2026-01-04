import mongoose from 'mongoose';
import User from '../models/User.js';
import { hash, Algorithm } from '@node-rs/argon2';
import dotenv from 'dotenv';

dotenv.config();

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const adminExists = await User.findOne({ email: 'admin@virtualworld.com' });
    if (adminExists) {
      console.log('Admin already exists.');
      process.exit(0);
    }

    const hashedPassword = await hash('StrongAdminPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      algorithm: Algorithm.Argon2id,
    });

    await User.create({
      username: 'admin',
      email: 'admin@virtualworld.com',
      password: hashedPassword,
      tokenVersion: 0
    });

    console.log('✅ Admin user created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seed();
