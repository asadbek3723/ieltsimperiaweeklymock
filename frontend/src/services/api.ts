import axios from 'axios';
import { getToken, removeToken } from '../utils/tokenStorage';

// In production (Vercel), VITE_API_URL points to the Railway backend.
// In development, VITE_API_URL is empty so Vite proxy handles /api -> localhost:5000.
const isDev = import.meta.env.DEV;
const baseURL = isDev
  ? '/api'
  : import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export const backendOrigin = isDev ? '' : (import.meta.env.VITE_API_URL || '');

export const uploadsURL = (relativePath: string) =>
  `${backendOrigin}/uploads/${relativePath}`;

const api = axios.create({ baseURL, timeout: 30000 });

api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (data: { fullName: string; phoneNumber: string; username: string; password: string }) =>
    api.post('/auth/register', data),
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data: { fullName?: string; username?: string; phoneNumber?: string }) =>
    api.patch('/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),
};

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
  createTest: (data: { title: string; maxAttempts: number; sections: object[] }) => api.post('/admin/tests', data),
  getTests: () => api.get('/admin/tests'),
  getTestDetail: (id: string) => api.get(`/admin/tests/${id}`),
  toggleTest: (id: string) => api.patch(`/admin/tests/${id}/toggle`),
  deleteTest: (id: string) => api.delete(`/admin/tests/${id}`),
  getStudents: () => api.get('/admin/students'),
  getResults: () => api.get('/admin/results'),
  getLiveSessions: () => api.get('/admin/live'),
  getResetRequests: () => api.get('/admin/reset-requests'),
  getPaymentStatus: () => api.get('/admin/payment/status'),
  getPaymentHistory: (page = 1, limit = 20) => api.get(`/admin/payment/history?page=${page}&limit=${limit}`),
  getPaymentRate: () => api.get('/admin/payment/rate'),
  submitPaymentReceipt: (formData: FormData) =>
    api.post('/admin/payment/submit', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updatePaymentTimer: (action: 'add' | 'remove' | 'setdate' | 'add30', value?: string | number) =>
    api.patch('/admin/payment/timer', { action, value }),
};

export const studentApi = {
  getDashboard: () => api.get('/student/dashboard'),
  joinTest: (pin: string) => api.post('/student/test/join', { pin }),
  advanceSection: (testSessionId: string, answers?: object[]) =>
    api.post('/student/test/advance', { testSessionId, answers }, { timeout: 60000 }),
  submitTest: (testSessionId: string, answers: object[]) =>
    api.post(`/student/test/${testSessionId}/submit`, { answers }, { timeout: 60000 }),
  saveAnswers: (testSessionId: string, answers: object[]) =>
    api.post('/student/test/save-answers', { testSessionId, answers }),
  reportTabSwitch: (testSessionId: string) =>
    api.post('/student/test/tab-switch', { testSessionId }),
  getActiveSession: () => api.get('/student/test/active'),
  getResults: () => api.get('/student/results'),
  getResultDetail: (id: string) => api.get(`/student/results/${id}`),
};

export default api;
