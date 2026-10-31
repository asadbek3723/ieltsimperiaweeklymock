import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest, SectionConfig, VARIANT_GROUPS } from '../types';
import { createTest, getAdminTests, toggleTestStatus } from '../services/testService';
import { getStudentsForAdmin } from '../services/resultService';
import { countAvailableExercises, countAvailablePracticeQuestions } from '../utils/questionLoader';
import prisma from '../config/database';
import { cache } from '../utils/cache';

const sectionSchema = z.object({
  subject: z.enum(['VOCABULARY', 'GRAMMAR']),
  sectionType: z.enum(['EXERCISE', 'PRACTICE_TEST']).default('EXERCISE'),
  selectionMode: z.enum(['BY_EXERCISE', 'BY_QUESTION']).default('BY_EXERCISE'),
  targetQuestionCount: z.number().int().min(1).max(1000).optional(),
  variantGroups: z.array(z.enum(VARIANT_GROUPS)).min(1, 'At least one variant group required'),
  numberOfExercises: z.number().int().min(1).max(200),
  timeAllocated: z.number().int().min(1).max(180),
  sectionOrder: z.number().int().min(1).max(10),
});

const createTestSchema = z.object({
  title: z.string().min(2).max(200),
  maxAttempts: z.number().int().min(1).max(100).default(1),
  sections: z.array(sectionSchema).min(1).max(10),
});

export async function handleCreateTest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = createTestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.errors[0].message });
      return;
    }

    const { title, maxAttempts, sections } = parsed.data;

    // Validate availability per section
    for (const s of sections) {
      if (s.sectionType === 'PRACTICE_TEST') {
        const available = countAvailablePracticeQuestions(s.subject, s.variantGroups);
        if (s.numberOfExercises > available) {
          res.status(400).json({
            success: false,
            message: `Only ${available} ${s.subject.toLowerCase()} practice questions available in selected groups [${s.variantGroups.join(', ')}], requested ${s.numberOfExercises}`,
          });
          return;
        }
      } else {
        // In BY_QUESTION mode: all available exercises are used as the pool,
        // numberOfExercises is auto-set to 50 by the frontend and does NOT
        // represent a hard limit — skip the pool-size check.
        const selectionMode = (s as unknown as { selectionMode?: string }).selectionMode || 'BY_EXERCISE';
        if (selectionMode !== 'BY_QUESTION') {
          const available = countAvailableExercises(s.subject, s.variantGroups);
          if (s.numberOfExercises > available) {
            res.status(400).json({
              success: false,
              message: `Only ${available} ${s.subject.toLowerCase()} exercises available in selected groups [${s.variantGroups.join(', ')}], requested ${s.numberOfExercises}`,
            });
            return;
          }
        }
      }

    }

    const test = await createTest(req.user!.userId, title, maxAttempts, sections as SectionConfig[]);
    res.status(201).json({ success: true, data: test });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create test';
    res.status(400).json({ success: false, message });
  }
}

export async function handleGetTests(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminId = req.user!.userId;
    const cacheKey = `tests:${adminId}`;
    const cached = cache.get<object[]>(cacheKey);
    if (cached) { res.json({ success: true, data: cached }); return; }

    const tests = await getAdminTests(adminId);
    cache.set(cacheKey, tests, 60); // 60 second cache
    res.json({ success: true, data: tests });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch tests' });
  }
}

export async function handleToggleTest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;
    const test = await toggleTestStatus(id, adminId);
    // Invalidate caches on mutation
    cache.invalidate(`tests:${adminId}`);
    cache.invalidate(`dashboard:${adminId}`);
    res.json({ success: true, data: test });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update test';
    res.status(400).json({ success: false, message });
  }
}

export async function handleGetStudents(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminId = req.user!.userId;
    const cacheKey = `students:${adminId}`;
    const cached = cache.get<object[]>(cacheKey);
    if (cached) { res.json({ success: true, data: cached }); return; }

    const students = await getStudentsForAdmin(adminId);
    cache.set(cacheKey, students, 60); // 60 second cache
    res.json({ success: true, data: students });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch students' });
  }
}

export async function handleGetDashboard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminId = req.user!.userId;
    const cacheKey = `dashboard:${adminId}`;

    // Return cached result if fresh (30 second TTL)
    const cached = cache.get<object>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    // Run all queries in parallel — use groupBy count instead of findMany+distinct
    const [totalTests, uniqueStudents, activeSessions] = await Promise.all([
      prisma.testSession.count({ where: { createdBy: adminId } }),
      prisma.result.groupBy({
        by: ['studentId'],
        where: { testSession: { createdBy: adminId } },
        _count: { studentId: true },
      }),
      prisma.activeSession.findMany({
        where: { testSession: { createdBy: adminId }, isActive: true },
        select: {
          id: true,
          currentSectionIndex: true,
          createdAt: true,
          student: { select: { fullName: true, username: true } },
          testSession: { select: { title: true, pinCode: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const data = {
      totalTests,
      totalStudents: uniqueStudents.length,
      liveCount: activeSessions.length,
      liveSessions: activeSessions,
    };

    cache.set(cacheKey, data, 30); // Cache 30 seconds
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
  }
}

export async function handleGetLiveSessions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sessions = await prisma.activeSession.findMany({
      where: { testSession: { createdBy: req.user!.userId }, isActive: true },
      include: {
        student: { select: { fullName: true, username: true, phoneNumber: true } },
        testSession: { select: { title: true, pinCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: sessions });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch live sessions' });
  }
}

export async function handleDeleteTest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;

    const test = await prisma.testSession.findFirst({ where: { id, createdBy: adminId } });
    if (!test) {
      res.status(404).json({ success: false, message: 'Test topilmadi' });
      return;
    }

    await prisma.testSession.delete({ where: { id } });
    cache.invalidate(`tests:${adminId}`);
    cache.invalidate(`dashboard:${adminId}`);
    res.json({ success: true, message: "Test o'chirildi" });
  } catch {
    res.status(500).json({ success: false, message: "Test o'chirishda xatolik" });
  }
}

export async function handleGetTestDetail(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;

    const test = await prisma.testSession.findFirst({
      where: { id, createdBy: adminId },
      include: {
        sections: { orderBy: { sectionOrder: 'asc' } },
        results: {
          include: {
            student: { select: { fullName: true, username: true, phoneNumber: true } },
          },
          orderBy: { submittedAt: 'desc' },
        },
        _count: { select: { results: true, activeSessions: true } },
      },
    });

    if (!test) {
      res.status(404).json({ success: false, message: 'Test topilmadi' });
      return;
    }

    res.json({ success: true, data: test });
  } catch {
    res.status(500).json({ success: false, message: "Test ma'lumotlarini yuklab bo'lmadi" });
  }
}

export async function handleGetPasswordResetRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    const requests = await prisma.passwordResetRequest.findMany({
      where: { isUsed: false, expiresAt: { gt: new Date() } },
      include: {
        student: { select: { fullName: true, username: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: requests });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch password reset requests' });
  }
}
