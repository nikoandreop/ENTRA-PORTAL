import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import { createServer } from 'node:http';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './models/database.js';
import { WebSocketServer } from './services/websocket.js';
import { authRouter } from './routes/auth.js';
import { tenantRouter } from './routes/tenants.js';
import { userRouter } from './routes/users.js';
import { groupRouter } from './routes/groups.js';
import { policyRouter } from './routes/policies.js';
import { alertRouter } from './routes/alerts.js';
import { auditRouter } from './routes/audit.js';
import { agentRouter } from './routes/agents.js';
import { dashboardRouter } from './routes/dashboard.js';
import { intuneRouter } from './routes/intune.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { API_PORT, WS_PORT, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS } from '../shared/constants/index.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", `ws://localhost:${WS_PORT}`, 'wss:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

app.use(compression());
app.use(hpp());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
}));

app.use(requestLogger);

app.get('/api/health', async (_req, res) => {
  try {
    const { getDb } = await import('./models/database.js');
    await getDb().query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'unhealthy', timestamp: new Date().toISOString(), version: '1.0.0', database: 'disconnected' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/tenants/:tenantId/users', userRouter);
app.use('/api/tenants/:tenantId/groups', groupRouter);
app.use('/api/tenants/:tenantId/policies', policyRouter);
app.use('/api/tenants/:tenantId/alerts', alertRouter);
app.use('/api/tenants/:tenantId/audit', auditRouter);
app.use('/api/tenants/_/audit', auditRouter);
app.use('/api/tenants/:tenantId/intune', intuneRouter);
app.use('/api/agents', agentRouter);
app.use('/api/dashboard', dashboardRouter);

app.use(errorHandler);

async function start() {
  try {
    await initDatabase();
    logger.info('Database initialized');

    const httpServer = createServer(app);
    httpServer.listen(API_PORT, () => {
      logger.info(`API server listening on port ${API_PORT}`);
    });

    const wsServer = new WebSocketServer(WS_PORT);
    wsServer.start();
    logger.info(`WebSocket server listening on port ${WS_PORT}`);

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      wsServer.stop();
      httpServer.close(async () => {
        await closeDatabase();
        logger.info('Server closed');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
