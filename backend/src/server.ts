import 'dotenv/config';
import http from 'http';
import app from './app';
import { initSocket } from './socket/socketHandler';
import prisma from './config/database';
import { ENV } from './config/env';

const server = http.createServer(app);
initSocket(server);

async function main() {
  console.log('[Server] Starting startup sequence...');
  const HOST = '0.0.0.0';
  
  server.listen(ENV.PORT, HOST, () => {
    console.log(`[Server] Listening on http://${HOST}:${ENV.PORT}`);
    console.log(`[Server] Public URL expectation: ${process.env.RAILWAY_STATIC_URL || 'Not set'}`);
    console.log(`[Server] Environment: ${ENV.NODE_ENV}`);
  });

  try {
    console.log('[DB] Connecting to PostgreSQL...');
    await prisma.$connect();
    console.log('[DB] Connected successfully');

    // Start background payment expiry monitoring (checks every 5 minutes)
    const { checkAndNotifyExpiry } = await import('./services/paymentService');
    checkAndNotifyExpiry().catch(e => console.error('[ExpiryCheck] Initial error:', e));
    setInterval(() => {
      checkAndNotifyExpiry().catch(e => console.error('[ExpiryCheck] Periodic error:', e));
    }, 5 * 60 * 1000);
  } catch (err) {
    console.error('[DB] Connection warning/error:', err);
  }
}

main();

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});
