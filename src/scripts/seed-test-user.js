import mongoose from 'mongoose';
import User from '../models/User.js';
import { hash, Algorithm } from '@node-rs/argon2';
import dotenv from 'dotenv';

dotenv.config();

const seedTestUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const testUserExists = await User.findOne({ username: 'testuser' });
    if (testUserExists) {
      // Update the password and reset login attempts if user exists
      const hashedPassword = await hash('Test@1234', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        algorithm: Algorithm.Argon2id,
      });

      await User.findByIdAndUpdate(testUserExists._id, {
        password: hashedPassword,
        failedLoginAttempts: 0,
        $unset: { lockUntil: 1 }
      });

      console.log('Test user password updated successfully!');
      process.exit(0);
    }

    const hashedPassword = await hash('Test@1234', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      algorithm: Algorithm.Argon2id,
    });

    await User.create({
      username: 'testuser',
      email: 'testuser@example.com',
      password: hashedPassword,
      tokenVersion: 0
    });

    console.log('✅ Test user created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding test user failed:', err);
    process.exit(1);
  }
};

seedTestUser();
