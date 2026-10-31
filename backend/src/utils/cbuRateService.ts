import https from 'https';

let cachedRate: number | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export async function getUSDRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedRate;
  }

  return new Promise((resolve) => {
    const url = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/';
    
    const req = https.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        return resolve(cachedRate || 12800);
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const rawRate = Array.isArray(parsed) ? parsed[0]?.Rate : parsed?.Rate;
          const rate = parseFloat(rawRate);
          if (!isNaN(rate) && rate > 0) {
            cachedRate = rate;
            lastFetchTime = now;
            resolve(rate);
          } else {
            resolve(cachedRate || 12800);
          }
        } catch {
          resolve(cachedRate || 12800);
        }
      });
    });

    req.on('error', () => {
      resolve(cachedRate || 12800);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(cachedRate || 12800);
    });
  });
}
