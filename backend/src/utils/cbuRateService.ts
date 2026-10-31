import https from 'https';

let cachedRate: number | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

function fetchJson(url: string, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      timeout: timeoutMs,
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

export async function getUSDRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedRate;
  }

  // 1. Try Central Bank of Uzbekistan (CBU) first
  try {
    const parsed = await fetchJson('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/', 4000);
    const rawRate = Array.isArray(parsed) ? parsed[0]?.Rate : parsed?.Rate;
    const rate = parseFloat(rawRate);
    if (!isNaN(rate) && rate > 0) {
      cachedRate = rate;
      lastFetchTime = now;
      return rate;
    }
  } catch (err) {
    console.warn('[ExchangeRate] CBU fetch failed or blocked, trying fallback provider...');
  }

  // 2. Fallback: Open Exchange Rates API (open.er-api.com)
  try {
    const parsed = await fetchJson('https://open.er-api.com/v6/latest/USD', 4000);
    const uzsRate = parseFloat(parsed?.rates?.UZS);
    if (!isNaN(uzsRate) && uzsRate > 0) {
      cachedRate = uzsRate;
      lastFetchTime = now;
      return uzsRate;
    }
  } catch (err) {
    console.warn('[ExchangeRate] open.er-api.com fallback failed...');
  }

  // 3. Fallback: exchangerate-api.com
  try {
    const parsed = await fetchJson('https://api.exchangerate-api.com/v4/latest/USD', 4000);
    const uzsRate = parseFloat(parsed?.rates?.UZS);
    if (!isNaN(uzsRate) && uzsRate > 0) {
      cachedRate = uzsRate;
      lastFetchTime = now;
      return uzsRate;
    }
  } catch (err) {
    console.warn('[ExchangeRate] exchangerate-api fallback failed...');
  }

  // Return last known cached rate or realistic fallback
  return cachedRate || 12023;
}
