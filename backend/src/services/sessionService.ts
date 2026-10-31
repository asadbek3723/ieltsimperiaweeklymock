import prisma from '../config/database';
import { SectionSubject, SubmitAnswer } from '../types';
import {
  loadExercisesFromGroups,
  loadAllExercises,
  selectRandomExercises,
  buildClientExercises,
  loadPracticeQuestionsFromGroups,
  selectRandomPracticeQuestions,
  buildClientPracticeQuestions,
} from '../utils/questionLoader';
import { validatePinAndGetSections } from './testService';

// In-memory store for per-student answer maps during a test
// Key: `${studentId}_${testSessionId}`, Value: { questionKey -> correctAnswer }
const activeAnswerMaps = new Map<string, Record<string, string>>();

function mapKey(studentId: string, testSessionId: string) {
  return `${studentId}_${testSessionId}`;
}

export function storeAnswerMap(studentId: string, testSessionId: string, map: Record<string, string>): void {
  const key = mapKey(studentId, testSessionId);
  const existing = activeAnswerMaps.get(key) || {};
  activeAnswerMaps.set(key, { ...existing, ...map });
}

export function getAnswerMap(studentId: string, testSessionId: string): Record<string, string> {
  return activeAnswerMaps.get(mapKey(studentId, testSessionId)) || {};
}

export function clearAnswerMap(studentId: string, testSessionId: string): void {
  activeAnswerMaps.delete(mapKey(studentId, testSessionId));
}

// ─── Join Test ────────────────────────────────────────────────────────────────

export async function joinTest(studentId: string, pin: string) {
  // Check if already in an active test
  const existing = await prisma.activeSession.findFirst({
    where: { studentId, isActive: true },
  });

  const session = await validatePinAndGetSections(pin);
  const sections = session.sections;
  if (sections.length === 0) throw new Error('Test has no sections configured');

  if (existing) {
    const isExpired = new Date() > new Date(existing.sectionDeadline);

    if (existing.pinCode === pin && existing.testSessionId === session.id && !isExpired) {
      // Resume the existing session
      const currentSection = sections.find(s => s.sectionOrder === existing.sectionOrder);
      if (!currentSection) throw new Error('Active section not found in test definition');

      const selectedExercisesMap: Record<string, string[]> = JSON.parse(existing.selectedExercises);
      const selectedQuestionsMap: Record<string, string[]> = JSON.parse((existing as any).selectedQuestions || '{}');
      const exerciseIds = selectedExercisesMap[String(currentSection.sectionOrder)] || [];
      const allowedQuestions = selectedQuestionsMap[String(currentSection.sectionOrder)];
      const currentClientExercises = getClientContentForSection(currentSection, exerciseIds, allowedQuestions);

      const resumeSectionType = (currentSection as unknown as { sectionType?: string }).sectionType || 'EXERCISE';
      return {
        testSessionId: session.id,
        title: session.title,
        serverTime: new Date().toISOString(),
        sections: sections.map(s => ({
          subject: s.subject,
          sectionType: (s as unknown as { sectionType?: string }).sectionType || 'EXERCISE',
          variantGroups: JSON.parse(s.variantGroups),
          numberOfExercises: s.numberOfExercises,
          timeAllocated: s.timeAllocated,
          sectionOrder: s.sectionOrder,
        })),
        currentSection: {
          subject: currentSection.subject,
          sectionType: resumeSectionType,
          sectionOrder: currentSection.sectionOrder,
          deadline: existing.sectionDeadline,
          serverTime: new Date().toISOString(),
          ...(resumeSectionType === 'PRACTICE_TEST'
            ? { questions: currentClientExercises }
            : { exercises: currentClientExercises }),
          answers: JSON.parse(existing.answers || '[]'),
        },
      };
    } else {
      // Automatically close the old session (either expired or from another test)
      await prisma.activeSession.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }
  }

  // Check attempt count
  const previousAttempts = await prisma.result.count({
    where: { studentId, testSessionId: session.id },
  });
  if (previousAttempts >= session.maxAttempts) {
    throw new Error(`Maximum attempts (${session.maxAttempts}) reached for this test`);
  }

  // Select random exercises/questions for ALL sections upfront
  const selectedExercisesMap: Record<string, string[]> = {};
  const selectedQuestionsMap: Record<string, string[]> = {};
  const allAnswerMaps: Record<string, string> = {};
  const globalUsedIds = new Set<string>();

  for (const sec of sections) {
    const variantGroups: string[] = JSON.parse(sec.variantGroups);
    const sectionType = (sec as unknown as { sectionType?: string }).sectionType || 'EXERCISE';

    if (sectionType === 'PRACTICE_TEST') {
      // Practice test: load individual questions, shuffle order + options per student
      const pool = loadPracticeQuestionsFromGroups(sec.subject, variantGroups);
      const availablePool = pool.filter(q => !globalUsedIds.has(q.id));
      const selectionPool = availablePool.length >= sec.numberOfExercises ? availablePool : pool;
      const selected = selectRandomPracticeQuestions(selectionPool, sec.numberOfExercises);

      selectedExercisesMap[String(sec.sectionOrder)] = selected.map(q => q.id);
      selected.forEach(q => globalUsedIds.add(q.id));

      const { answerMap } = buildClientPracticeQuestions(selected);
      Object.assign(allAnswerMaps, answerMap);
    } else {
      // Regular exercise section
      let pool;
      if (variantGroups.length === 5) {
        pool = loadAllExercises(sec.subject);
      } else {
        pool = loadExercisesFromGroups(sec.subject, variantGroups);
      }

      const availablePool = pool.filter(ex => !globalUsedIds.has(ex.id));
      const selectionPool = availablePool.length >= sec.numberOfExercises ? availablePool : pool;

      const selectionMode = (sec as unknown as { selectionMode?: string }).selectionMode || 'BY_EXERCISE';
      const targetQuestionCount = (sec as unknown as { targetQuestionCount?: number }).targetQuestionCount;

      let selected: import('../types').Exercise[] = [];
      let allowedQuestions: string[] | undefined = undefined;

      if (selectionMode === 'BY_QUESTION' && targetQuestionCount) {
        const shuffled = selectRandomExercises(selectionPool, selectionPool.length);
        let currentQCount = 0;
        allowedQuestions = [];

        for (const ex of shuffled) {
          selected.push(ex);
          globalUsedIds.add(ex.id);

          for (const q of ex.questions) {
            let pts = 1;
            const blankCount = (q.text || '').split('___').length - 1;
            const anyQ = q as Record<string, unknown>;
            if (blankCount > 1 && Array.isArray(anyQ.answers) && anyQ.answers.length > 1) {
              pts = blankCount;
            }

            if (currentQCount + pts <= targetQuestionCount) {
              allowedQuestions.push(`${ex.id}_${q.id}`);
              currentQCount += pts;
            }

            if (currentQCount === targetQuestionCount) break;
          }

          if (currentQCount === targetQuestionCount) break;
        }
        selectedQuestionsMap[String(sec.sectionOrder)] = allowedQuestions;
      } else {
        selected = selectRandomExercises(selectionPool, sec.numberOfExercises);
        selected.forEach(e => globalUsedIds.add(e.id));
      }

      selectedExercisesMap[String(sec.sectionOrder)] = selected.map(e => e.id);

      const { answerMap } = buildClientExercises(selected, allowedQuestions);
      Object.assign(allAnswerMaps, answerMap);
    }
  }

  // Store all answer maps for this student+test
  storeAnswerMap(studentId, session.id, allAnswerMaps);

  const firstSection = sections[0];
  const sectionDeadline = new Date(Date.now() + firstSection.timeAllocated * 60 * 1000);

  // Create active session with all selected exercise IDs
  await prisma.activeSession.create({
    data: {
      studentId,
      testSessionId: session.id,
      pinCode: pin,
      currentSubject: firstSection.subject as SectionSubject,
      sectionOrder: firstSection.sectionOrder,
      sectionDeadline,
      selectedExercises: JSON.stringify(selectedExercisesMap),
      selectedQuestions: JSON.stringify(selectedQuestionsMap),
    },
  });

  // Build client payload for first section
  const firstExerciseIds = selectedExercisesMap[String(firstSection.sectionOrder)];
  const firstAllowedQuestions = selectedQuestionsMap[String(firstSection.sectionOrder)];
  const firstSectionType = (firstSection as unknown as { sectionType?: string }).sectionType || 'EXERCISE';
  const firstClientContent = getClientContentForSection(firstSection, firstExerciseIds, firstAllowedQuestions);

  return {
    testSessionId: session.id,
    title: session.title,
    serverTime: new Date().toISOString(),
    sections: sections.map(s => ({
      subject: s.subject,
      sectionType: (s as unknown as { sectionType?: string }).sectionType || 'EXERCISE',
      variantGroups: JSON.parse(s.variantGroups),
      numberOfExercises: s.numberOfExercises,
      timeAllocated: s.timeAllocated,
      sectionOrder: s.sectionOrder,
    })),
    currentSection: {
      subject: firstSection.subject,
      sectionType: firstSectionType,
      sectionOrder: firstSection.sectionOrder,
      deadline: sectionDeadline,
      serverTime: new Date().toISOString(),
      ...(firstSectionType === 'PRACTICE_TEST'
        ? { questions: firstClientContent }
        : { exercises: firstClientContent }),
    },
  };
}

// ─── Advance to next section ──────────────────────────────────────────────────

export async function advanceSection(studentId: string, testSessionId: string, currentAnswers: SubmitAnswer[]) {
  const activeSession = await prisma.activeSession.findFirst({
    where: { studentId, testSessionId, isActive: true },
  });
  if (!activeSession) throw new Error('No active session found');

  // Save progress: merge current answers into DB
  const existingAnswers: SubmitAnswer[] = JSON.parse(activeSession.answers || '[]');
  const newAnswersMap = new Map(existingAnswers.map(a => [a.questionId, a]));
  currentAnswers.forEach(a => newAnswersMap.set(a.questionId, a));
  const mergedAnswers = Array.from(newAnswersMap.values());

  const allSections = await prisma.testSection.findMany({
    where: { testSessionId },
    orderBy: { sectionOrder: 'asc' },
  });

  const nextSection = allSections.find(s => s.sectionOrder > activeSession.sectionOrder);

  if (!nextSection) {
    // No more sections — session ended
    await prisma.activeSession.update({
      where: { id: activeSession.id },
      data: { isActive: false, answers: JSON.stringify(mergedAnswers) },
    });
    return null;
  }

  const sectionDeadline = new Date(Date.now() + nextSection.timeAllocated * 60 * 1000);

  await prisma.activeSession.update({
    where: { id: activeSession.id },
    data: {
      currentSubject: nextSection.subject as SectionSubject,
      sectionOrder: nextSection.sectionOrder,
      sectionDeadline,
      answers: JSON.stringify(mergedAnswers),
    },
  });

  // Get pre-selected exercise/question IDs for this section
  const selectedExercisesMap: Record<string, string[]> = JSON.parse(activeSession.selectedExercises);
  const selectedQuestionsMap: Record<string, string[]> = JSON.parse((activeSession as any).selectedQuestions || '{}');
  const exerciseIds = selectedExercisesMap[String(nextSection.sectionOrder)] || [];
  const allowedQuestions = selectedQuestionsMap[String(nextSection.sectionOrder)];
  const nextSectionType = (nextSection as unknown as { sectionType?: string }).sectionType || 'EXERCISE';
  const clientContent = getClientContentForSection(nextSection, exerciseIds, allowedQuestions);

  return {
    subject: nextSection.subject,
    sectionType: nextSectionType,
    sectionOrder: nextSection.sectionOrder,
    deadline: sectionDeadline,
    serverTime: new Date().toISOString(),
    ...(nextSectionType === 'PRACTICE_TEST'
      ? { questions: clientContent }
      : { exercises: clientContent }),
  };
}

// ─── Internal: build client content for a section from stored IDs ────────────

function getClientContentForSection(
  section: { subject: string; variantGroups: string; sectionType?: string },
  ids: string[],
  allowedQuestions?: string[]
): unknown[] {
  const variantGroups: string[] = JSON.parse(section.variantGroups);
  const sectionType = (section as unknown as { sectionType?: string }).sectionType || 'EXERCISE';

  if (sectionType === 'PRACTICE_TEST') {
    const pool = loadPracticeQuestionsFromGroups(section.subject, variantGroups);
    // Preserve the stored (shuffled) order
    const selected = ids
      .map(id => pool.find(q => q.id === id))
      .filter(Boolean) as import('../types').PracticeQuestion[];
    const { clientQuestions } = buildClientPracticeQuestions(selected);
    return clientQuestions;
  }

  let pool;
  if (variantGroups.length === 5) {
    pool = loadAllExercises(section.subject);
  } else {
    pool = loadExercisesFromGroups(section.subject, variantGroups);
  }

  const selectedExercises = ids
    .map(id => pool.find(e => e.id === id))
    .filter(Boolean) as import('../types').Exercise[];

  const { clientExercises } = buildClientExercises(selectedExercises, allowedQuestions);
  return clientExercises;
}

// ─── Tab switch recording ───────────────────────────────────────────────────

export async function recordTabSwitch(studentId: string, testSessionId: string): Promise<number> {
  const updated = await prisma.activeSession.updateMany({
    where: { studentId, testSessionId, isActive: true },
    data: { tabSwitchCount: { increment: 1 }, lastActive: new Date() },
  });

  if (updated.count === 0) return 0;

  const session = await prisma.activeSession.findFirst({
    where: { studentId, testSessionId, isActive: true },
  });
  return session?.tabSwitchCount || 0;
}

export async function updateActiveAnswers(studentId: string, testSessionId: string, answers: SubmitAnswer[]) {
  const activeSession = await prisma.activeSession.findFirst({
    where: { studentId, testSessionId, isActive: true },
  });
  if (!activeSession) return;

  const existingAnswers: SubmitAnswer[] = JSON.parse(activeSession.answers || '[]');
  const map = new Map(existingAnswers.map(a => [a.questionId, a]));
  answers.forEach(a => map.set(a.questionId, a));

  await prisma.activeSession.update({
    where: { id: activeSession.id },
    data: {
      answers: JSON.stringify(Array.from(map.values())),
      lastActive: new Date(),
    },
  });
}
