import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  JoinTestResponse, SectionConfig, CurrentSection, SubmitAnswer
} from '../types';

export const SS_PIN = 'ielts_active_pin';
export const SS_ANSWERS = 'ielts_test_answers';
export const SS_RULES_ACCEPTED = 'ielts_rules_accepted';

type TestPhase = 'idle' | 'join' | 'in-section' | 'section-transition' | 'completed';

interface TestContextType {
  phase: TestPhase;
  testSessionId: string | null;
  title: string;
  sections: SectionConfig[];
  currentSection: CurrentSection | null;
  /** ISO string from the server at the moment the current section was started/resumed.
   *  Used by the timer to correct for client clock drift. */
  serverTime: string | null;
  answers: Record<string, SubmitAnswer>;
  setAnswer: (questionId: string, answer: SubmitAnswer) => void;
  initTest: (data: JoinTestResponse) => void;
  goToNextSection: (nextSection: CurrentSection | null) => void;
  completeTest: () => void;
  getAllAnswers: () => SubmitAnswer[];
  reset: () => void;
}

const TestContext = createContext<TestContextType | null>(null);

export function TestProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<TestPhase>('idle');
  const [testSessionId, setTestSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [currentSection, setCurrentSection] = useState<CurrentSection | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, SubmitAnswer>>({});

  const setAnswer = useCallback((questionId: string, answer: SubmitAnswer) => {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: answer };
      // Immediately persist to sessionStorage — refresh-safe
      try { sessionStorage.setItem(SS_ANSWERS, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const initTest = useCallback((data: JoinTestResponse) => {
    setTestSessionId(data.testSessionId);
    setTitle(data.title);
    setSections(data.sections);
    setCurrentSection(data.currentSection);
    // Store server time for timer drift correction
    setServerTime(data.serverTime ?? data.currentSection.serverTime ?? null);

    // Start with server-saved answers (from resume)
    let restored: Record<string, SubmitAnswer> = {};
    if (data.currentSection?.answers) {
      data.currentSection.answers.forEach(a => {
        restored[a.questionId] = a;
      });
    }

    // Overlay with sessionStorage answers (they're always fresher — saved on every answer)
    try {
      const savedJson = sessionStorage.getItem(SS_ANSWERS);
      if (savedJson) {
        const saved = JSON.parse(savedJson) as Record<string, SubmitAnswer>;
        restored = { ...restored, ...saved };
      }
    } catch {}

    setAnswers(restored);
    setPhase('in-section');
  }, []);

  const goToNextSection = useCallback((nextSection: CurrentSection | null) => {
    if (!nextSection) {
      setPhase('completed');
      setCurrentSection(null);
      setServerTime(null);
    } else {
      setCurrentSection(nextSection);
      // advanceSection response includes serverTime at the top level of the section object
      setServerTime(nextSection.serverTime ?? null);
      setPhase('in-section');
    }
  }, []);

  const completeTest = useCallback(() => {
    setPhase('completed');
  }, []);

  const getAllAnswers = useCallback(() => Object.values(answers), [answers]);

  const reset = useCallback(() => {
    setPhase('idle');
    setTestSessionId(null);
    setTitle('');
    setSections([]);
    setCurrentSection(null);
    setServerTime(null);
    setAnswers({});
    try {
      sessionStorage.removeItem(SS_ANSWERS);
      sessionStorage.removeItem(SS_PIN);
      sessionStorage.removeItem(SS_RULES_ACCEPTED);
    } catch {}
  }, []);

  return (
    <TestContext.Provider value={{
      phase, testSessionId, title, sections, currentSection, serverTime,
      answers, setAnswer, initTest, goToNextSection, completeTest, getAllAnswers, reset
    }}>
      {children}
    </TestContext.Provider>
  );
}

export function useTest() {
  const ctx = useContext(TestContext);
  if (!ctx) throw new Error('useTest must be inside TestProvider');
  return ctx;
}
