import type { RecoveryLogEntry, WorkoutSession } from '../types';

export interface RecoverySummary {
  score: number;
  status: 'Primed' | 'Ready' | 'Moderate' | 'Fatigued';
  tone: 'lime' | 'success' | 'warning' | 'danger';
  recommendation: string;
}

export function calculateRecoverySummary(
  latest: RecoveryLogEntry | undefined,
  sleepGoalHours: number,
  waterMl: number,
  waterGoalMl: number,
  recentSessions: WorkoutSession[]
): RecoverySummary {
  if (!latest) {
    return {
      score: 75,
      status: 'Ready',
      tone: 'success',
      recommendation: 'Log today’s sleep, soreness, and steps to personalize recovery guidance.',
    };
  }

  const sleepRatio = Math.min(1.1, latest.sleepHours / Math.max(5, sleepGoalHours));
  const sleepPts = sleepRatio * 30 + (latest.sleepQuality / 5) * 15; // up to ~48
  const strainPenalty = ((latest.fatigue + latest.soreness + latest.stress) / 15) * 28; // 0..28
  const moodPts = (latest.mood / 5) * 12;
  const hydrationPts = Math.min(1, waterMl / Math.max(1000, waterGoalMl)) * 15;

  // High recent training load nudges fatigue awareness
  const recentLoadPenalty = recentSessions.length >= 5 ? 4 : 0;

  const raw = Math.round(
    Math.max(20, Math.min(100, sleepPts + moodPts + hydrationPts + (28 - strainPenalty) - recentLoadPenalty))
  );

  if (raw >= 84) {
    return {
      score: raw,
      status: 'Primed',
      tone: 'lime',
      recommendation: 'High readiness. Ideal day to push progressive overload on compound lifts.',
    };
  }
  if (raw >= 68) {
    return {
      score: raw,
      status: 'Ready',
      tone: 'success',
      recommendation: 'Good recovery. Stick to planned working sets and normal RPE targets.',
    };
  }
  if (raw >= 50) {
    return {
      score: raw,
      status: 'Moderate',
      tone: 'warning',
      recommendation: 'Elevated fatigue or shorter sleep. Keep 1–2 reps in reserve and hydrate well.',
    };
  }
  return {
    score: raw,
    status: 'Fatigued',
    tone: 'danger',
    recommendation: 'Low readiness. Consider reducing volume by 25%, prioritizing mobility, or taking a rest day.',
  };
}
