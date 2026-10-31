import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { ENV } from './config/env';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import studentRoutes from './routes/studentRoutes';
import { handleTelegramWebhook } from './controllers/paymentController';
import { errorHandler } from './middleware/errorHandler';

const app = express();
app.set('trust proxy', 1);
console.log('[Express] Initializing middleware and routes...');

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'TriCorp agency');
  res.setHeader('X-Developer', 'TriCorp developers (hello!)');
  next();
});

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = (ENV.CLIENT_URL || '')
  .split(',')
  .map(u => u.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const cleanOrigin = origin.replace(/[\r\n\t]/g, '').trim();
    const isAllowed = allowedOrigins.length === 0 || allowedOrigins.some(o => o === '*' || o === cleanOrigin);
    if (isAllowed) {
      try {
        res.setHeader('Access-Control-Allow-Origin', cleanOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      } catch (err) {
        console.error('[CORS Header Error]', err);
      }
    }
  } else {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } catch {}
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Rate limits configured for exam centers where many students share the same public IP/NAT
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15000, // Safe for 100+ students autosaving every 10s from the same IP
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/me', // /me is called on every page load/refresh
});
app.use('/api/auth', authLimiter);
app.use(limiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);

// Telegram bot webhook endpoint (public callback from Telegram)
app.post('/api/telegram/webhook', handleTelegramWebhook);

// Health check (JSON)
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() }));

// Root — professional status page
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MOC API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 48px; max-width: 480px; width: 90%; text-align: center; }
    .dot { width: 12px; height: 12px; background: #22c55e; border-radius: 50%; display: inline-block; margin-right: 8px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.7;transform:scale(1.2)} }
    h1 { font-size: 28px; font-weight: 700; color: #f8fafc; margin: 20px 0 8px; }
    .status { display: inline-flex; align-items: center; background: #14532d; color: #86efac; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .desc { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 32px; }
    .endpoints { background: #0f172a; border-radius: 10px; padding: 16px; text-align: left; font-family: monospace; font-size: 13px; }
    .endpoint { display: flex; align-items: center; gap: 10px; padding: 6px 0; color: #94a3b8; border-bottom: 1px solid #1e293b; }
    .endpoint:last-child { border: none; }
    .method { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #1d4ed8; color: #bfdbfe; min-width: 42px; text-align: center; }
    .method.post { background: #166534; color: #bbf7d0; }
    .route { color: #e2e8f0; }
    .uptime { margin-top: 24px; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status"><span class="dot"></span>All systems operational</div>
    <h1>MOC Platform API</h1>
    <p class="desc">Backend server is running. Use the frontend application to access the platform.</p>
    <div class="endpoints">
      <div class="endpoint"><span class="method post">POST</span><span class="route">/api/auth/login</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="route">/api/auth/register</span></div>
      <div class="endpoint"><span class="method">GET</span><span class="route">/api/admin/dashboard</span></div>
      <div class="endpoint"><span class="method">GET</span><span class="route">/api/student/results</span></div>
      <div class="endpoint"><span class="method">GET</span><span class="route">/health</span></div>
    </div>
    <p class="uptime">Uptime: ${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s</p>
  </div>
</body>
</html>`);
});

app.use(errorHandler);

export default app;
