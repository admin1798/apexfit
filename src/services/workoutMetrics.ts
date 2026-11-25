import type { MuscleGroup, WorkoutSession, WorkoutSetLog } from '../types';

/**
 * Epley formula for Estimated 1RM in kg.
 */
export function calculateEstimated1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weightKg * 10) / 10;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function calculateSetVolume(set: Pick<WorkoutSetLog, 'weightKg' | 'reps' | 'completed' | 'setType'>): number {
  if (!set.completed || set.setType === 'warmup') return 0;
  const w = set.weightKg ?? 0;
  const r = set.reps ?? 0;
  return w > 0 && r > 0 ? w * r : 0;
}

export function calculateSessionVolume(session: Pick<WorkoutSession, 'exercises'>): number {
  let total = 0;
  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      total += calculateSetVolume(set);
    }
  }
  return Math.round(total);
}

/**
 * Computes consecutive workout streak (days with workouts or 48h grace for rest days).
 * Specifically counts active weekly consistency: consecutive days or active training streak
 * where resting 1 day between sessions preserves streak, or consecutive training days.
 * Let's compute consecutive training days ending today/yesterday, AND weekly workouts count.
 */
export function calculateWorkoutStreak(sessions: WorkoutSession[]): {
  currentStreakDays: number;
  sessionsThisWeek: number;
} {
  if (sessions.length === 0) return { currentStreakDays: 0, sessionsThisWeek: 0 };

  const uniqueDates = Array.from(
    new Set(sessions.map((s) => s.startedAt.slice(0, 10)))
  ).sort((a, b) => (a > b ? -1 : 1));

  const today = new Date();
  const todayStr = toLocalDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateKey(yesterday);

  // Weekly count (last 7 days)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = toLocalDateKey(sevenDaysAgo);
  const sessionsThisWeek = sessions.filter((s) => s.startedAt.slice(0, 10) >= sevenDaysAgoStr).length;

  // Streak: allow up to 1 rest day gap between workouts so realistic PPL lifters keep a streak
  const latest = uniqueDates[0];
  const diffFromToday = daysBetween(latest, todayStr);
  if (diffFromToday > 2 && latest !== todayStr && latest !== yesterdayStr) {
    return { currentStreakDays: 0, sessionsThisWeek };
  }

  let streak = 1;
  for (let i = 0; i < uniqueDates.length - 1; i++) {
    const gap = daysBetween(uniqueDates[i + 1], uniqueDates[i]);
    if (gap <= 2) {
      streak++;
    } else {
      break;
    }
  }

  return { currentStreakDays: streak, sessionsThisWeek };
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function offsetDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateKey(dt);
}

function daysBetween(earlierKey: string, laterKey: string): number {
  const a = new Date(`${earlierKey}T00:00:00`).getTime();
  const b = new Date(`${laterKey}T00:00:00`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export interface ExerciseHistoricalBest {
  maxWeight: number;
  max1RM: number;
  maxSetVolume: number;
}

/**
 * Computes historical bests per exercise across prior sessions and stamps PR flags on a new session.
 */
export function stampPersonalRecords(
  newSession: WorkoutSession,
  pastSessions: WorkoutSession[]
): WorkoutSession {
  const bestByExercise = new Map<string, ExerciseHistoricalBest>();

  for (const session of pastSessions) {
    if (session.id === newSession.id) continue;
    for (const ex of session.exercises) {
      const current = bestByExercise.get(ex.exerciseId) ?? {
        maxWeight: 0,
        max1RM: 0,
        maxSetVolume: 0,
      };
      for (const set of ex.sets) {
        if (!set.completed || set.setType === 'warmup') continue;
        const w = set.weightKg ?? 0;
        const r = set.reps ?? 0;
        if (w <= 0 || r <= 0) continue;
        current.maxWeight = Math.max(current.maxWeight, w);
        current.max1RM = Math.max(current.max1RM, calculateEstimated1RM(w, r));
        current.maxSetVolume = Math.max(current.maxSetVolume, w * r);
      }
      bestByExercise.set(ex.exerciseId, current);
    }
  }

  const stampedExercises = newSession.exercises.map((ex) => {
    const prevBest = bestByExercise.get(ex.exerciseId) ?? {
      maxWeight: 0,
      max1RM: 0,
      maxSetVolume: 0,
    };
    let bestWeightInSession = prevBest.maxWeight;
    let best1RMInSession = prevBest.max1RM;
    let bestVolInSession = prevBest.maxSetVolume;

    const sets = ex.sets.map((set) => {
      if (!set.completed || set.setType === 'warmup') {
        return { ...set, isPRWeight: false, isPR1RM: false, isPRVolume: false };
      }
      const w = set.weightKg ?? 0;
      const r = set.reps ?? 0;
      if (w <= 0 || r <= 0) {
        return { ...set, isPRWeight: false, isPR1RM: false, isPRVolume: false };
      }

      const est1RM = calculateEstimated1RM(w, r);
      const vol = w * r;

      const isPRWeight = prevBest.maxWeight > 0 ? w > bestWeightInSession : false;
      const isPR1RM = prevBest.max1RM > 0 ? est1RM > best1RMInSession : false;
      const isPRVolume = prevBest.maxSetVolume > 0 ? vol > bestVolInSession : false;

      if (w > bestWeightInSession) bestWeightInSession = w;
      if (est1RM > best1RMInSession) best1RMInSession = est1RM;
      if (vol > bestVolInSession) bestVolInSession = vol;

      return { ...set, isPRWeight, isPR1RM, isPRVolume };
    });

    return { ...ex, sets };
  });

  return {
    ...newSession,
    totalVolumeKg: calculateSessionVolume({ exercises: stampedExercises }),
    exercises: stampedExercises,
  };
}

export function getPreviousExerciseSets(
  exerciseId: string,
  pastSessions: WorkoutSession[]
): Array<{ weightKg: number | null; reps: number | null }> {
  const sorted = [...pastSessions].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const session of sorted) {
    const match = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (match && match.sets.length > 0) {
      return match.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
    }
  }
  return [];
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const MUSCLE_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'];
