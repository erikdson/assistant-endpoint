import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatModernRouter from './chat-modern.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy',
    api: 'ai-sdk-core-backend', 
    version: '2.0',
    timestamp: new Date().toISOString()
  });
});

// AI SDK v5 chat endpoints
app.use('/api/chat', chatModernRouter);

// Alternative endpoint paths for compatibility
app.use('/api/responses', chatModernRouter);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('[Server Error]', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path,
    method: req.method 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\\n🚀 Modern AI SDK Core Backend`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔧 API Version: 2.0 (AI SDK Core)`);
  console.log(`🎯 Main endpoint: http://localhost:${PORT}/api/chat/create`);
  console.log(`🔗 Alt endpoint: http://localhost:${PORT}/api/responses/create`);
  console.log(`💡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});