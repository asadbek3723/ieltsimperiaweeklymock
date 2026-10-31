import prisma from '../config/database';
import { getUSDRate } from '../utils/cbuRateService';
import { sendPaymentNotification, editPaymentMessage, answerCallbackQuery, sendMessage } from './telegramService';
import { ENV } from '../config/env';
import { cache } from '../utils/cache';
import path from 'path';

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDate(d: Date) {
  return new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

async function getOrCreateSettings() {
  const now = new Date();
  let settings = await prisma.paymentSettings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    settings = await prisma.paymentSettings.create({
      data: {
        id: 'singleton',
        nextDueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        cycleStartDate: now,
        isActive: true,
      },
    });
  }
  return settings;
}

export async function getPaymentStatus() {
  const cacheKey = 'payment:status';
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  const rate = await getUSDRate();
  const costUSD = ENV.RAILWAY_COST_USD;
  const costUZS = Math.round(costUSD * rate);
  const now = new Date();

  const settings = await getOrCreateSettings();

  const diffMs = settings.nextDueDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isOverdue = daysLeft <= 0;

  const pendingPayment = await prisma.paymentRecord.findFirst({
    where: { status: 'PENDING' },
    orderBy: { submittedAt: 'desc' },
  });

  const result = {
    daysLeft,
    isOverdue,
    nextDueDate: settings.nextDueDate,
    cycleStartDate: settings.cycleStartDate,
    costUSD,
    costUZS,
    exchangeRate: rate,
    pendingPayment: pendingPayment
      ? {
          id: pendingPayment.id,
          submittedAt: pendingPayment.submittedAt,
          amountUZS: pendingPayment.amountUZS,
          amountUSD: pendingPayment.amountUSD,
          receiptUrl: pendingPayment.receiptUrl,
        }
      : null,
  };

  cache.set(cacheKey, result, 15); // 15 seconds TTL cache
  return result;
}

// ─── Timer management ─────────────────────────────────────────────────────────
export async function updateDueDate(action: 'add' | 'remove' | 'setdate' | 'add30', value?: string | number) {
  const settings = await getOrCreateSettings();
  const now = new Date();
  let newDate: Date;

  switch (action) {
    case 'add30':
      newDate = new Date(settings.nextDueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      break;
    case 'add': {
      const days = Number(value);
      if (isNaN(days) || days <= 0) throw new Error('Kun soni musbat bo\'lishi kerak');
      newDate = new Date(settings.nextDueDate.getTime() + days * 24 * 60 * 60 * 1000);
      break;
    }
    case 'remove': {
      const days = Number(value);
      if (isNaN(days) || days <= 0) throw new Error('Kun soni musbat bo\'lishi kerak');
      newDate = new Date(settings.nextDueDate.getTime() - days * 24 * 60 * 60 * 1000);
      break;
    }
    case 'setdate': {
      const parsed = new Date(value as string);
      if (isNaN(parsed.getTime())) throw new Error('Noto\'g\'ri sana formati. Masalan: 2024-12-31');
      newDate = parsed;
      break;
    }
    default:
      throw new Error('Noma\'lum amal');
  }

  await prisma.paymentSettings.update({
    where: { id: 'singleton' },
    data: { nextDueDate: newDate },
  });

  cache.invalidate('payment:status');

  const diffMs = newDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return { newDate, daysLeft };
}

export async function getPaymentHistory(page = 1, limit = 20) {
  const skip = Math.max(0, (page - 1) * limit);
  const [records, total] = await Promise.all([
    prisma.paymentRecord.findMany({
      orderBy: { submittedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.paymentRecord.count(),
  ]);

  return {
    records,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function submitPayment(params: {
  receiptUrl: string;
  receiptType: string;
  filename: string;
}) {
  const rate = await getUSDRate();
  const costUSD = ENV.RAILWAY_COST_USD;
  const costUZS = Math.round(costUSD * rate);
  const now = new Date();

  const settings = await getOrCreateSettings();

  const record = await prisma.paymentRecord.create({
    data: {
      amountUZS: costUZS,
      amountUSD: costUSD,
      exchangeRate: rate,
      receiptUrl: params.receiptUrl,
      receiptType: params.receiptType,
      status: 'PENDING',
      periodStart: settings.cycleStartDate,
      periodEnd: settings.nextDueDate,
      submittedAt: now,
    },
  });

  // Construct absolute URL for Telegram button if possible
  const rawClientUrl = (ENV.CLIENT_URL || '').split(',')[0].trim().replace(/\/+$/, '');
  const publicReceiptUrl = `${rawClientUrl}/api/admin/payment/receipt/${params.filename}`;

  try {
    const msgId = await sendPaymentNotification({
      receiptId: record.id,
      amountUZS: costUZS,
      amountUSD: costUSD,
      exchangeRate: rate,
      receiptUrl: publicReceiptUrl,
      submittedAt: record.submittedAt,
    });

    if (msgId) {
      await prisma.paymentRecord.update({
        where: { id: record.id },
        data: { telegramMsgId: msgId },
      });
    }
  } catch (err) {
    console.error('[PaymentService] Error sending Telegram notification:', err);
  }

  return record;
}

export async function confirmPayment(recordId: string) {
  const record = await prisma.paymentRecord.findUnique({
    where: { id: recordId },
  });

  if (!record) {
    throw new Error('To\'lov ma\'lumoti topilmadi');
  }

  if (record.status !== 'PENDING') {
    throw new Error(`Ushbu to'lov allaqachon ko'rib chiqilgan (${record.status})`);
  }

  const now = new Date();
  const newDueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.paymentRecord.update({
      where: { id: recordId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: now,
      },
    }),
    prisma.paymentSettings.upsert({
      where: { id: 'singleton' },
      update: {
        nextDueDate: newDueDate,
        cycleStartDate: now,
        isActive: true,
      },
      create: {
        id: 'singleton',
        nextDueDate: newDueDate,
        cycleStartDate: now,
        isActive: true,
      },
    }),
  ]);

  if (record.telegramMsgId) {
    const formattedDue = new Intl.DateTimeFormat('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(newDueDate);

    await editPaymentMessage(
      record.telegramMsgId,
      `✅ *To'lov muvaffaqiyatli tasdiqlandi!*\n\n` +
      `📅 *Yangi to'lov muddati:* ${formattedDue} gacha (30 kun qo'shildi)\n` +
      `🆔 \`${recordId}\``
    );
  }

  return { success: true, newDueDate };
}

export async function rejectPayment(recordId: string, reason?: string) {
  const record = await prisma.paymentRecord.findUnique({
    where: { id: recordId },
  });

  if (!record) {
    throw new Error('To\'lov ma\'lumoti topilmadi');
  }

  if (record.status !== 'PENDING') {
    throw new Error(`Ushbu to'lov allaqachon ko'rib chiqilgan (${record.status})`);
  }

  const now = new Date();
  await prisma.paymentRecord.update({
    where: { id: recordId },
    data: {
      status: 'REJECTED',
      rejectedAt: now,
      rejectedReason: reason || 'Admin tomonidan rad etildi',
    },
  });

  if (record.telegramMsgId) {
    await editPaymentMessage(
      record.telegramMsgId,
      `❌ *To'lov rad etildi*\n\n` +
      `Sabab: ${reason || 'Chek noaniq yoki qabul qilinmadi'}\n` +
      `🆔 \`${recordId}\``
    );
  }

  return { success: true };
}

export async function handleTelegramCallback(callbackData: string, callbackQueryId: string) {
  if (callbackData.startsWith('confirm_')) {
    const recordId = callbackData.replace('confirm_', '');
    try {
      await confirmPayment(recordId);
      await answerCallbackQuery(callbackQueryId, '✅ To\'lov tasdiqlandi! 30 kun qo\'shildi.', true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xatolik yuz berdi';
      await answerCallbackQuery(callbackQueryId, `⚠️ ${msg}`, true);
    }
  } else if (callbackData.startsWith('reject_')) {
    const recordId = callbackData.replace('reject_', '');
    try {
      await rejectPayment(recordId, 'Telegram orqali rad etildi');
      await answerCallbackQuery(callbackQueryId, '❌ To\'lov rad etildi.', true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xatolik yuz berdi';
      await answerCallbackQuery(callbackQueryId, `⚠️ ${msg}`, true);
    }
  }
}
