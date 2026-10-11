import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/agrichain',
  jwtSecret: process.env.JWT_SECRET || 'agrichain_super_secret_jwt_key_hackathon_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  contractAddress: process.env.CONTRACT_ADDRESS || null,
  localClientUrl: process.env.LOCAL_CLIENT_URL || null,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  publicClientUrl: process.env.PUBLIC_CLIENT_URL || null,
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : null,
};
