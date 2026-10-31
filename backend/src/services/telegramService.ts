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
    `1 USD = ${rateFormatted} so'm (${uzsFormatted} so'm)\n` +
    `ID: \`${params.receiptId}\``;

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

export async function editPaymentMessage(
  messageId: number,
  text: string,
  chatId?: string | number
): Promise<void> {
  const targetChatId = chatId || ENV.TELEGRAM_CHAT_ID;
  if (!targetChatId) return;

  // Try editMessageCaption first (if message is a photo/document)
  const captionRes = await telegramRequest('editMessageCaption', {
    chat_id: targetChatId,
    message_id: messageId,
    caption: text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [] }, // Remove action buttons!
  });

  // If message was plain text, fallback to editMessageText
  if (!captionRes.ok) {
    await telegramRequest('editMessageText', {
      chat_id: targetChatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] }, // Remove action buttons!
    });
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
  await telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

// ─── Send plain message to chat ───────────────────────────────────────────────
export async function sendMessage(
  text: string,
  chatId?: string | number,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  const targetChatId = chatId || ENV.TELEGRAM_CHAT_ID;
  if (!targetChatId) {
    console.warn('[Telegram] No target chatId for sendMessage');
    return;
  }
  const body: Record<string, unknown> = {
    chat_id: targetChatId,
    text,
    parse_mode: 'Markdown',
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  await telegramRequest('sendMessage', body);
}

// ─── Main Keyboard Menu (Clean, Professional, No slash typing needed!) ────────
export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '📊 Holatni ko\'rish' }, { text: '📜 To\'lovlar tarixi' }],
    [{ text: '➕ 30 kun qo\'shish' }, { text: '➕ Kun qo\'shish' }],
    [{ text: '➖ Kun ayirish' }, { text: '📅 Sana belgilash' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

// ─── Bot command & text handler ───────────────────────────────────────────────
export async function handleBotCommand(text: string, replyChatId?: string | number): Promise<void> {
  if (!text) return;

  const targetChatId = replyChatId || ENV.TELEGRAM_CHAT_ID;
  const { updateDueDate, getPaymentStatus, getPaymentHistory } = await import('./paymentService');

  const cleanText = text.trim();
  const lowerText = cleanText.toLowerCase();

  try {
    // 1. STATUS
    if (lowerText === '/status' || lowerText === '📊 holatni ko\'rish' || lowerText === 'status' || lowerText === 'holat') {
      const status = await getPaymentStatus();
      const statusIcon = status.isOverdue ? '🔴' : status.daysLeft <= 3 ? '🟠' : status.daysLeft <= 7 ? '🟡' : '🟢';
      const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(status.nextDueDate));
      
      const message =
        `${statusIcon} *Server To'lov Holati*\n\n` +
        `• *Qolgan muddat:* ${status.daysLeft <= 0 ? '0 kun (muddati tugagan)' : `${status.daysLeft} kun`}\n` +
        `• *To'lov muddati:* ${dueStr}\n` +
        `• *Oylik to'lov:* $${status.costUSD.toFixed(2)} (${Math.round(status.costUZS).toLocaleString('uz-UZ')} so'm)\n` +
        `• *CBU kursi:* 1 USD = ${Math.round(status.exchangeRate).toLocaleString('uz-UZ')} so'm\n\n` +
        `${status.pendingPayment ? '⚠️ *Kutilayotgan to\'lov cheki mavjud.*' : '✅ Kutilayotgan to\'lov cheklari yo\'q.'}`;

      await sendMessage(message, targetChatId, MAIN_KEYBOARD);
      return;
    }

    // 1.1 PAYMENT HISTORY
    if (lowerText === '/history' || lowerText === '📜 to\'lovlar tarixi' || lowerText === 'tarix') {
      const history = await getPaymentHistory(1, 5);
      if (!history.records || history.records.length === 0) {
        await sendMessage(`Hali hech qanday to'lov cheki mavjud emas.`, targetChatId, MAIN_KEYBOARD);
        return;
      }

      let historyText = `*So'nggi to'lovlar tarixi:*\n\n`;
      for (const rec of history.records) {
        const dateStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(rec.submittedAt));
        const statusBadge = rec.status === 'CONFIRMED' ? '✅ Tasdiqlangan' : rec.status === 'REJECTED' ? '❌ Rad etilgan' : '⏳ Kutilmoqda';
        historyText += `• ${dateStr} — *${Math.round(rec.amountUZS).toLocaleString('uz-UZ')} so'm* (${statusBadge})\n`;
      }

      await sendMessage(historyText, targetChatId, MAIN_KEYBOARD);
      return;
    }

    // 2. ADD 30 DAYS
    if (lowerText === '/add30' || lowerText === '➕ 30 kun qo\'shish' || lowerText === '+30') {
      const { newDate, daysLeft } = await updateDueDate('add30');
      const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
      await sendMessage(
        `✅ *To'lov muddatiga 30 kun qo'shildi.*\n\n` +
        `• Yangi muddat: *${dueStr}*\n` +
        `• Qolgan kun: *${daysLeft} kun*`,
        targetChatId,
        MAIN_KEYBOARD
      );
      return;
    }

    // 3. HELP OR START
    if (lowerText === '/start' || lowerText === '/help' || lowerText === 'ℹ️ yordam' || lowerText === 'yordam') {
      const welcome =
        `*IELTS Imperia Server Boshqaruv Markazi*\n\n` +
        `Quyidagi menyu tugmalaridan foydalanishingiz mumkin:\n\n` +
        `• *📊 Holatni ko'rish* — Server to'lovi va muddatini tekshirish\n` +
        `• *➕ 30 kun qo'shish* — Bir bosish bilan muddatni 1 oy uzaytirish\n` +
        `• *➕ Kun qo'shish* — Masalan: \`+7\` yoki \`+15\` deb yozing\n` +
        `• *➖ Kun ayirish* — Masalan: \`-5\` deb yozing\n` +
        `• *📅 Sana belgilash* — Masalan: \`2026-12-01\` deb yozing`;

      await sendMessage(welcome, targetChatId, MAIN_KEYBOARD);
      return;
    }

    // 4. ADD DAYS (Prompt or direct "+N" or "/add N")
    if (lowerText === '➕ kun qo\'shish') {
      await sendMessage(
        `Necha kun qo'shmoqchisiz?\n\nShunchaki qo'shmoqchi bo'lgan kun sonini yozib yuboring (masalan: *+7* yoki *+15*):`,
        targetChatId,
        MAIN_KEYBOARD
      );
      return;
    }

    if (/^\+?\d+$/.test(cleanText) || lowerText.startsWith('/add ')) {
      const days = parseInt(cleanText.replace(/^\+/, '').replace('/add ', '').trim(), 10);
      if (!isNaN(days) && days > 0) {
        const { newDate, daysLeft } = await updateDueDate('add', days);
        const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
        await sendMessage(
          `✅ *${days} kun muvaffaqiyatli qo'shildi.*\n\n` +
          `• Yangi muddat: *${dueStr}*\n` +
          `• Qolgan kun: *${daysLeft} kun*`,
          targetChatId,
          MAIN_KEYBOARD
        );
        return;
      }
    }

    // 5. REMOVE DAYS (Prompt or direct "-N" or "/remove N")
    if (lowerText === '➖ kun ayirish') {
      await sendMessage(
        `Necha kun ayirmoqchisiz?\n\nMinus belgisi bilan yozib yuboring (masalan: *-5* yoki *-3*):`,
        targetChatId,
        MAIN_KEYBOARD
      );
      return;
    }

    if (/^-\d+$/.test(cleanText) || lowerText.startsWith('/remove ')) {
      const days = Math.abs(parseInt(cleanText.replace('/remove ', '').trim(), 10));
      if (!isNaN(days) && days > 0) {
        const { newDate, daysLeft } = await updateDueDate('remove', days);
        const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
        await sendMessage(
          `✅ *${days} kun ayirildi.*\n\n` +
          `• Yangi muddat: *${dueStr}*\n` +
          `• Qolgan kun: *${daysLeft} kun*`,
          targetChatId,
          MAIN_KEYBOARD
        );
        return;
      }
    }

    // 6. SET EXACT DATE (Prompt or direct "YYYY-MM-DD" or "/setdate YYYY-MM-DD")
    if (lowerText === '📅 sana belgilash') {
      await sendMessage(
        `To'lov muddatini qaysi sanaga o'rnatmoqchisiz?\n\nSanani quyidagi ko'rinishda yozing (masalan: *2026-12-01*):`,
        targetChatId,
        MAIN_KEYBOARD
      );
      return;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanText) || lowerText.startsWith('/setdate ')) {
      const dateStr = cleanText.replace('/setdate ', '').trim();
      const { newDate, daysLeft } = await updateDueDate('setdate', dateStr);
      const dueStr = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(newDate);
      await sendMessage(
        `✅ *To'lov muddati belgilandi.*\n\n` +
        `• Yangi to'lov muddati: *${dueStr}*\n` +
        `• Qolgan kun: *${daysLeft} kun*`,
        targetChatId,
        MAIN_KEYBOARD
      );
      return;
    }

    // Default response
    await sendMessage(
      `Tushunarsiz buyruq.\n\nIltimos, pastdagi menyu tugmalaridan birini tanlang yoki */help* deb yozing.`,
      targetChatId,
      MAIN_KEYBOARD
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Xatolik yuz berdi';
    await sendMessage(`Xatolik: ${msg}`, targetChatId, MAIN_KEYBOARD);
  }
}
