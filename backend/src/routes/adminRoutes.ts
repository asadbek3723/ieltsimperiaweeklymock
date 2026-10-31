import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import {
  handleCreateTest,
  handleGetTests,
  handleToggleTest,
  handleGetStudents,
  handleGetDashboard,
  handleGetLiveSessions,
  handleDeleteTest,
  handleGetTestDetail,
  handleGetPasswordResetRequests,
} from '../controllers/adminController';
import { handleGetAllResults } from '../controllers/resultsController';
import {
  handleGetPaymentStatus,
  handleGetPaymentHistory,
  handleGetRate,
  handleSubmitReceipt,
  handleServeReceipt,
  handleManualConfirm,
  handleManualReject,
  handleUpdateTimer,
} from '../controllers/paymentController';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

router.get('/dashboard', handleGetDashboard);
router.post('/tests', handleCreateTest);
router.get('/tests', handleGetTests);
router.get('/tests/:id', handleGetTestDetail);
router.patch('/tests/:id/toggle', handleToggleTest);
router.delete('/tests/:id', handleDeleteTest);
router.get('/students', handleGetStudents);
router.get('/results', handleGetAllResults);
router.get('/live', handleGetLiveSessions);
router.get('/reset-requests', handleGetPasswordResetRequests);

// Payment portal endpoints
router.get('/payment/status', handleGetPaymentStatus);
router.get('/payment/history', handleGetPaymentHistory);
router.get('/payment/rate', handleGetRate);
router.post('/payment/submit', handleSubmitReceipt);
router.get('/payment/receipt/:filename', handleServeReceipt);
router.patch('/payment/:id/confirm', handleManualConfirm);
router.patch('/payment/:id/reject', handleManualReject);
router.patch('/payment/timer', handleUpdateTimer);

export default router;
