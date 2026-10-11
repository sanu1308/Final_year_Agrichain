import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { connectDB } from './lib/db.js';
import apiRouter from './routes/index.js';
import { QRCodeService } from './services/qr.service.js';

const app = express();

// Configure environment-aware CORS
const isProduction = config.nodeEnv === 'production';
const allowedOrigins = config.allowedOrigins || (config.clientUrl ? [config.clientUrl] : []);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (mobile apps, server-to-server, curl, Postman)
      if (!origin) return callback(null, true);

      // In development, allow all origins for friction-free local and LAN testing
      if (!isProduction) {
        return callback(null, true);
      }

      // In production, strictly enforce allowedOrigins
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      return callback(new Error(`CORS policy error: Origin ${origin} is not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount API
app.use('/api/v1', apiRouter);

// Root fallback
app.get('/', (req, res) => {
  res.json({
    project: 'AgriChain',
    description: 'Blockchain-Based Supply Chain Transparency for Agricultural Produce',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

async function startServer() {
  try {
    await connectDB();
    app.listen(config.port, config.host, () => {
      console.log(`====================================================`);
      console.log(` AgriChain API Server running on ${config.host}:${config.port}`);
      console.log(` Environment:  ${config.nodeEnv}`);
      console.log(` Health Check: http://localhost:${config.port}/api/v1/health`);
      console.log(` Client URL:   ${config.clientUrl}`);
      console.log(` Public URL:   ${config.publicClientUrl}`);
      console.log(` QR Base URL:  ${QRCodeService.getBaseVerifyUrl()}`);
      console.log(` Database:     MongoDB (agrichain)`);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
