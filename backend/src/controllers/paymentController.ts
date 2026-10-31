import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  getPaymentStatus,
  getPaymentHistory,
  submitPayment,
  confirmPayment,
  rejectPayment,
  handleTelegramCallback,
  updateDueDate,
} from '../services/paymentService';
import { handleBotCommand } from '../services/telegramService';
import { getUSDRate } from '../utils/cbuRateService';
import { ENV } from '../config/env';

// Ensure receipts directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'receipts');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext) ? ext : '.png';
    const uniqueName = `receipt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`;
    cb(null, uniqueName);
  },
});

const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const uploadReceiptMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Faqat JPG, PNG, WebP yoki PDF formatidagi cheklarni yuklash mumkin!'));
    }
  },
}).single('receipt');

export async function handleGetPaymentStatus(req: Request, res: Response) {
  try {
    const status = await getPaymentStatus();
    return res.json({
      success: true,
      data: {
        ...status,
        cardNumber: ENV.CARD_NUMBER,
      },
    });
  } catch (error) {
    console.error('[PaymentController] Error getting status:', error);
    return res.status(500).json({ success: false, message: 'To\'lov holatini olishda server xatosi' });
  }
}

export async function handleGetPaymentHistory(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const history = await getPaymentHistory(page, limit);
    return res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('[PaymentController] Error getting history:', error);
    return res.status(500).json({ success: false, message: 'To\'lov tarixini olishda server xatosi' });
  }
}

export async function handleGetRate(req: Request, res: Response) {
  try {
    const rate = await getUSDRate();
    const costUSD = ENV.RAILWAY_COST_USD;
    return res.json({
      success: true,
      data: {
        rate,
        costUSD,
        costUZS: Math.round(costUSD * rate),
      },
    });
  } catch (error) {
    console.error('[PaymentController] Error getting rate:', error);
    return res.status(500).json({ success: false, message: 'Valyuta kursini olishda xatolik' });
  }
}

export async function handleSubmitReceipt(req: Request, res: Response) {
  uploadReceiptMiddleware(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : 'Fayl yuklashda xatolik yuz berdi',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Iltimos, to\'lov cheki faylini tanlang',
      });
    }

    try {
      const isImage = req.file.mimetype.startsWith('image/');
      const receiptType = isImage ? 'image' : 'pdf';
      const filename = path.basename(req.file.path);
      const relativeUrl = `/api/admin/payment/receipt/${filename}`;

      const record = await submitPayment({
        receiptUrl: relativeUrl,
        receiptType,
        filename,
      });

      return res.json({
        success: true,
        message: 'To\'lov cheki qabul qilindi va tasdiqlash uchun yuborildi',
        data: {
          id: record.id,
          status: record.status,
          amountUZS: record.amountUZS,
          amountUSD: record.amountUSD,
          submittedAt: record.submittedAt,
        },
      });
    } catch (submitErr) {
      console.error('[PaymentController] Error submitting payment:', submitErr);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(500).json({
        success: false,
        message: 'To\'lovni ro\'yxatga olishda server xatosi',
      });
    }
  });
}

export async function handleServeReceipt(req: Request, res: Response) {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(uploadDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: 'Chek fayli topilmadi' });
    }

    return res.sendFile(filepath);
  } catch (error) {
    console.error('[PaymentController] Error serving receipt:', error);
    return res.status(500).json({ success: false, message: 'Faylni ochishda xatolik' });
  }
}

export async function handleManualConfirm(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await confirmPayment(id);
    return res.json({ success: true, message: 'To\'lov tasdiqlandi', data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Xatolik yuz berdi';
    return res.status(400).json({ success: false, message: msg });
  }
}

export async function handleManualReject(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await rejectPayment(id, reason);
    return res.json({ success: true, message: 'To\'lov rad etildi', data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Xatolik yuz berdi';
    return res.status(400).json({ success: false, message: msg });
  }
}

export async function handleUpdateTimer(req: Request, res: Response) {
  try {
    const { action, value } = req.body;
    if (!['add', 'remove', 'setdate', 'add30'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri parametr (action)' });
    }
    const result = await updateDueDate(action, value);
    return res.json({
      success: true,
      message: 'Timer muvaffaqiyatli yangilandi',
      data: result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Xatolik yuz berdi';
    return res.status(400).json({ success: false, message: msg });
  }
}

export async function handleTelegramWebhook(req: Request, res: Response) {
  // Always answer 200 OK fast to Telegram to prevent retry floods
  res.status(200).json({ ok: true });

  try {
    const { callback_query, message } = req.body;
    if (callback_query && callback_query.data && callback_query.id) {
      await handleTelegramCallback(callback_query.data, callback_query.id);
    } else if (message && message.text) {
      await handleBotCommand(message.text);
    }
  } catch (err) {
    console.error('[PaymentController] Telegram webhook error:', err);
  }
}
