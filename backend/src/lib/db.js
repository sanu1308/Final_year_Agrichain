import mongoose from 'mongoose';
import { config } from '../config/index.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      autoIndex: true,
    });
    isConnected = true;
    console.log(`Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

export { mongoose };
