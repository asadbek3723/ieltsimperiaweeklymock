import https from 'https';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env';

interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

export function telegramRequest<T = unknown>(
  method: string,
  body: Record<string, unknown>
): Promise<TelegramApiResponse<T>> {
  if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] Bot token or chat ID is missing. Skipping telegram notification.');
    return Promise.resolve({ ok: false, description: 'Telegram credentials missing' });
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const options: https.RequestOptions = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${ENV.TELEGRAM_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve({ ok: false, description: 'Invalid JSON response from Telegram' });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Telegram] Request error:', err.message);
      resolve({ ok: false, description: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[Telegram] Request timeout');
      resolve({ ok: false, description: 'Timeout' });
    });

    req.write(payload);
    req.end();
  });
}

export async function sendPaymentNotification(params: {
  receiptId: string;
  amountUZS: number;
  amountUSD: number;
  exchangeRate: number;
  receiptUrl: string;
  submittedAt: Date;
}): Promise<number | null> {
  const dateFormatted = new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(params.submittedAt);

  const uzsFormatted = Math.round(params.amountUZS).toLocaleString('uz-UZ');
  const rateFormatted = Math.round(params.exchangeRate).toLocaleString('uz-UZ');

  const text = 
    `💳 *Yangi server to'lov cheki yuklandi!*\n\n` +
    `💵 *Summa USD:* $${params.amountUSD.toFixed(2)}\n` +
    `🇺🇿 *Summa UZS:* ${uzsFormatted} so'm\n` +
    `📊 *Markaziy Bank kursi:* 1 USD = ${rateFormatted} so'm\n` +
    `📅 *Vaqti:* ${dateFormatted}\n\n` +
    `🆔 \`${params.receiptId}\`\n\n` +
    `Iltimos, chekni ko'rib chiqib tasdiqlang yoki rad eting:`;

  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  if (params.receiptUrl && params.receiptUrl.startsWith('http')) {
    inlineKeyboard.push([{ text: '📄 Chekni ko\'rish', url: params.receiptUrl }]);
  }

  inlineKeyboard.push([
    { text: '✅ Tasdiqlash', callback_data: `confirm_${params.receiptId}` },
    { text: '❌ Rad etish', callback_data: `reject_${params.receiptId}` },
  ]);

  const res = await telegramRequest<{ message_id: number }>('sendMessage', {
    chat_id: ENV.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  });

  return res.ok && res.result ? res.result.message_id : null;
}

export async function editPaymentMessage(messageId: number, text: string): Promise<void> {
  await telegramRequest('editMessageText', {
    chat_id: ENV.TELEGRAM_CHAT_ID,
    message_id: messageId,
    text,
    parse_mode: 'Markdown',
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
  await telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}
