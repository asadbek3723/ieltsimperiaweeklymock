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

function sendMultipartFormData(
  method: string,
  fields: Record<string, string>,
  fileField: { name: string; filename: string; path: string; contentType: string }
): Promise<TelegramApiResponse<{ message_id: number }>> {
  if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) {
    return Promise.resolve({ ok: false, description: 'Telegram credentials missing' });
  }

  return new Promise((resolve) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const crlf = '\r\n';

    let headerParts: Buffer[] = [];

    // Fields
    for (const [k, v] of Object.entries(fields)) {
      headerParts.push(Buffer.from(
        `--${boundary}${crlf}` +
        `Content-Disposition: form-data; name="${k}"${crlf}${crlf}` +
        `${v}${crlf}`
      ));
    }

    // File header
    headerParts.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"${crlf}` +
      `Content-Type: ${fileField.contentType}${crlf}${crlf}`
    ));

    const fileBuffer = fs.readFileSync(fileField.path);
    const footerBuffer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

    const payload = Buffer.concat([...headerParts, fileBuffer, footerBuffer]);

    const options: https.RequestOptions = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${ENV.TELEGRAM_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
      },
      timeout: 20000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, description: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (err) => resolve({ ok: false, description: err.message }));
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
  receiptType?: string;
  filePath?: string;
  filename?: string;
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

  const caption = 
    `💳 *Yangi server to'lov cheki yuklandi!*\n\n` +
    `💵 *Summa USD:* $${params.amountUSD.toFixed(2)}\n` +
    `🇺🇿 *Summa UZS:* ${uzsFormatted} so'm\n` +
    `📊 *Markaziy Bank kursi:* 1 USD = ${rateFormatted} so'm\n` +
    `📅 *Vaqti:* ${dateFormatted}\n\n` +
    `🆔 \`${params.receiptId}\`\n\n` +
    `Iltimos, chekni ko'rib chiqib tasdiqlang yoki rad eting:`;

  const inlineKeyboard = [
    [
      { text: '✅ Tasdiqlash', callback_data: `confirm_${params.receiptId}` },
      { text: '❌ Rad etish', callback_data: `reject_${params.receiptId}` },
    ]
  ];

  const replyMarkupStr = JSON.stringify({ inline_keyboard: inlineKeyboard });

  // If local file exists, send actual photo or document directly!
  if (params.filePath && fs.existsSync(params.filePath)) {
    const isImage = params.receiptType === 'image' || ['.jpg', '.jpeg', '.png', '.webp'].some(ext => (params.filename || '').toLowerCase().endsWith(ext));
    const method = isImage ? 'sendPhoto' : 'sendDocument';
    const fieldName = isImage ? 'photo' : 'document';
    const contentType = isImage ? 'image/jpeg' : 'application/pdf';

    const uploadRes = await sendMultipartFormData(
      method,
      {
        chat_id: String(ENV.TELEGRAM_CHAT_ID),
        caption,
        parse_mode: 'Markdown',
        reply_markup: replyMarkupStr,
      },
      {
        name: fieldName,
        filename: params.filename || 'receipt.jpg',
        path: params.filePath,
        contentType,
      }
    );

    if (uploadRes.ok && uploadRes.result) {
      return uploadRes.result.message_id;
    }
  }

  // Fallback to text message with photo link if multipart upload fails
  const res = await telegramRequest<{ message_id: number }>('sendMessage', {
    chat_id: ENV.TELEGRAM_CHAT_ID,
    text: caption,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: inlineKeyboard },
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

// ─── Send plain message to chat ───────────────────────────────────────────────
export async function sendMessage(text: string, chatId?: string | number): Promise<void> {
  const targetChatId = chatId || ENV.TELEGRAM_CHAT_ID;
  if (!targetChatId) {
    console.warn('[Telegram] No target chatId for sendMessage');
    return;
  }
  await telegramRequest('sendMessage', {
    chat_id: targetChatId,
    text,
    parse_mode: 'Markdown',
  });
}

// ─── Bot command handler ──────────────────────────────────────────────────────
const HELP_TEXT = `
🤖 *To'lov Timer Bot — Buyruqlar:*

📊 \`/status\` — Joriy holat (qancha kun qoldi, to'lov muddati)
➕ \`/add30\` — 30 kun qo'shish
➕ \`/add <kun>\` — N kun qo'shish (masalan: \`/add 7\`)
➖ \`/remove <kun>\` — N kun ayirish (masalan: \`/remove 5\`)
📅 \`/setdate <sana>\` — Aniq sana belgilash (masalan: \`/setdate 2024-12-31\`)
❓ \`/help\` — Yordam

*Misol:*
\`/add 15\` → 15 kun qo'shadi
\`/setdate 2026-12-01\` → To'lov muddatini shu sanaga belgilaydi
`.trim();

export async function handleBotCommand(text: string, replyChatId?: string | number): Promise<void> {
  if (!text || !text.startsWith('/')) return;

  const targetChatId = replyChatId || ENV.TELEGRAM_CHAT_ID;

  // Lazy import to avoid circular dependency
  const { updateDueDate, getPaymentStatus } = await import('./paymentService');

  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase().split('@')[0]; // remove @botname suffix

  try {
    switch (cmd) {
      case '/start':
      case '/help': {
        await sendMessage(HELP_TEXT, targetChatId);
        break;
      }

      case '/status': {
        const status = await getPaymentStatus();
        const flag = status.isOverdue ? '🔴' : status.daysLeft <= 3 ? '🟠' : status.daysLeft <= 7 ? '🟡' : '🟢';
        const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(status.nextDueDate));
        await sendMessage(
          `${flag} *Server To'lov Holati*\n\n` +
          `⏳ *Qolgan muddat:* ${status.daysLeft <= 0 ? `0 kun (muddati o'tgan!)` : status.daysLeft + ' kun'}\n` +
          `📅 *To'lov muddati:* ${dueStr}\n` +
          `💵 *Oylik narx:* $${status.costUSD.toFixed(2)} ≈ ${Math.round(status.costUZS).toLocaleString()} so'm\n` +
          `📊 *CBU kursi:* ${Math.round(status.exchangeRate).toLocaleString()} UZS / 1 USD\n` +
          `${status.pendingPayment ? '⚠️ *Kutilayotgan to\'lov cheki bor!*' : '✅ Kutilayotgan to\'lov yo\'q'}`,
          targetChatId
        );
        break;
      }

      case '/add30': {
        const { newDate, daysLeft } = await updateDueDate('add30');
        const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
        await sendMessage(`✅ *30 kun qo'shildi!*\n\n📅 Yangi to'lov muddati: *${dueStr}*\n⏳ Qolgan kun: *${daysLeft} kun*`, targetChatId);
        break;
      }

      case '/add': {
        const days = parseInt(parts[1] || '', 10);
        if (isNaN(days) || days <= 0) {
          await sendMessage('⚠️ Noto\'g\'ri buyruq. Misol: `/add 7`', targetChatId);
          break;
        }
        const { newDate, daysLeft } = await updateDueDate('add', days);
        const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
        await sendMessage(`✅ *${days} kun qo'shildi!*\n\n📅 Yangi to'lov muddati: *${dueStr}*\n⏳ Qolgan kun: *${daysLeft} kun*`, targetChatId);
        break;
      }

      case '/remove': {
        const days = parseInt(parts[1] || '', 10);
        if (isNaN(days) || days <= 0) {
          await sendMessage('⚠️ Noto\'g\'ri buyruq. Misol: `/remove 5`', targetChatId);
          break;
        }
        const { newDate, daysLeft } = await updateDueDate('remove', days);
        const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
        await sendMessage(`✅ *${days} kun ayirildi!*\n\n📅 Yangi to'lov muddati: *${dueStr}*\n⏳ Qolgan kun: *${daysLeft} kun*`, targetChatId);
        break;
      }

      case '/setdate': {
        const dateStr = parts[1];
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          await sendMessage('⚠️ Noto\'g\'ri format. Misol: `/setdate 2026-12-01`', targetChatId);
          break;
        }
        const { newDate, daysLeft } = await updateDueDate('setdate', dateStr);
        const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
        await sendMessage(`✅ *To'lov muddati belgilandi!*\n\n📅 Yangi muddat: *${dueStr}*\n⏳ Qolgan kun: *${daysLeft} kun*`, targetChatId);
        break;
      }

      default: {
        await sendMessage(`❓ Noma'lum buyruq: \`${cmd}\`\n\n${HELP_TEXT}`, targetChatId);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Xatolik yuz berdi';
    await sendMessage(`❌ *Xatolik:* ${msg}`, targetChatId);
  }
}
