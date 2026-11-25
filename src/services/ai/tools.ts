import { OFFLINE_FOOD_DATABASE } from '../../data/offlineFoods';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { calculateRecoverySummary } from '../recoveryCalc';
import { displayWeight, weightLabel } from '../units';
import {
  MUSCLE_GROUPS,
  calculateEstimated1RM,
  calculateWorkoutStreak,
  offsetDateKey,
  toLocalDateKey,
} from '../workoutMetrics';
import type { ParsedFoodItem, Routine } from '../../types';

export interface ToolAuthContext {
  sessionToken: string;
  profileId: string;
}

function assertAuthorized(auth: ToolAuthContext) {
  if (!auth.sessionToken || auth.sessionToken.trim().length < 8 || !auth.profileId) {
    throw new Error('UNAUTHORIZED_TOOL_ACCESS');
  }
}

// ---------------- WORKOUT TOOLS ----------------

export async function getTodayWorkout(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const todayKey = toLocalDateKey(new Date());
  const weekday = new Date().getDay();
  const [routines, sessions] = await Promise.all([
    db.routines.toArray(),
    db.workoutSessions.orderBy('startedAt').reverse().toArray(),
  ]);
  const completedToday = sessions.find((s) => s.startedAt.slice(0, 10) === todayKey) ?? null;
  const scheduled = routines.find((r) => r.scheduledWeekdays?.includes(weekday)) ?? null;
  const recommended =
    scheduled ??
    [...routines].sort((a, b) => (a.lastPerformedAt ?? '').localeCompare(b.lastPerformedAt ?? ''))[0] ??
    null;

  return { todayKey, completedToday, scheduled, recommended };
}

export async function getCurrentProgram(auth: ToolAuthContext) {
  assertAuthorized(auth);
  return db.routines.toArray();
}

export async function getRecentWorkouts(auth: ToolAuthContext, limit = 6) {
  assertAuthorized(auth);
  const safeLimit = Math.max(1, Math.min(20, limit));
  const sessions = await db.workoutSessions.orderBy('startedAt').reverse().limit(safeLimit).toArray();
  return sessions.map((s) => ({
    id: s.id,
    date: s.startedAt.slice(0, 10),
    routineName: s.routineName,
    durationMin: Math.round(s.durationSeconds / 60),
    totalVolumeKg: s.totalVolumeKg,
    exercises: s.exercises.map((ex) => ({
      name: ex.exerciseName,
      muscleGroup: ex.muscleGroup,
      sets: ex.sets
        .filter((st) => st.completed)
        .map((st) => ({
          weightKg: st.weightKg,
          reps: st.reps,
          rpe: st.rpe,
          setType: st.setType,
        })),
    })),
  }));
}

export async function getExerciseHistory(auth: ToolAuthContext, exerciseQuery: string) {
  assertAuthorized(auth);
  const q = exerciseQuery.trim().toLowerCase();
  const sessions = await db.workoutSessions.orderBy('startedAt').reverse().toArray();
  const matches: Array<{
    date: string;
    exerciseName: string;
    sets: Array<{ weightKg: number | null; reps: number | null; rpe: number | null; est1RM: number }>;
  }> = [];

  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (q && !ex.exerciseName.toLowerCase().includes(q)) continue;
      matches.push({
        date: s.startedAt.slice(0, 10),
        exerciseName: ex.exerciseName,
        sets: ex.sets
          .filter((st) => st.completed && st.setType !== 'warmup')
          .map((st) => ({
            weightKg: st.weightKg,
            reps: st.reps,
            rpe: st.rpe,
            est1RM: calculateEstimated1RM(st.weightKg ?? 0, st.reps ?? 0),
          })),
      });
    }
    if (matches.length >= 6) break;
  }
  return matches;
}

export async function getExercisePerformance(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const sessions = await db.workoutSessions.orderBy('startedAt').reverse().toArray();
  const byEx = new Map<
    string,
    {
      exerciseId: string;
      name: string;
      muscleGroup: string;
      sessions: Array<{ date: string; topWeightKg: number; topReps: number; best1RM: number; setsSummary: string }>;
    }
  >();

  for (const s of sessions) {
    for (const ex of s.exercises) {
      const working = ex.sets.filter((st) => st.completed && st.setType !== 'warmup');
      if (working.length === 0) continue;
      let topW = 0;
      let topR = 0;
      let best1RM = 0;
      for (const st of working) {
        const w = st.weightKg ?? 0;
        const r = st.reps ?? 0;
        const e1 = calculateEstimated1RM(w, r);
        if (w > topW) topW = w;
        if (e1 > best1RM) {
          best1RM = e1;
          topR = r;
        }
      }
      const entry = byEx.get(ex.exerciseId) ?? {
        exerciseId: ex.exerciseId,
        name: ex.exerciseName,
        muscleGroup: ex.muscleGroup,
        sessions: [],
      };
      if (entry.sessions.length < 3) {
        entry.sessions.push({
          date: s.startedAt.slice(0, 10),
          topWeightKg: topW,
          topReps: topR,
          best1RM,
          setsSummary: working.map((st) => `${st.weightKg ?? 0}kg×${st.reps ?? 0}`).join(', '),
        });
      }
      byEx.set(ex.exerciseId, entry);
    }
  }

  return Array.from(byEx.values()).slice(0, 8);
}

export async function getPersonalRecords(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const sessions = await db.workoutSessions.orderBy('startedAt').reverse().toArray();
  const prs: Array<{ date: string; exerciseName: string; weightKg: number; reps: number; est1RM: number }> = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      for (const st of ex.sets) {
        if (st.completed && (st.isPR1RM || st.isPRWeight)) {
          prs.push({
            date: s.startedAt.slice(0, 10),
            exerciseName: ex.exerciseName,
            weightKg: st.weightKg ?? 0,
            reps: st.reps ?? 0,
            est1RM: calculateEstimated1RM(st.weightKg ?? 0, st.reps ?? 0),
          });
        }
      }
    }
  }
  return prs.slice(0, 10);
}

export async function getWeeklyTrainingVolume(auth: ToolAuthContext, days = 7) {
  assertAuthorized(auth);
  const cutoff = offsetDateKey(toLocalDateKey(new Date()), -(Math.max(1, days) - 1));
  const sessions = await db.workoutSessions.toArray();
  const setsByMuscle: Record<string, number> = {};
  for (const mg of MUSCLE_GROUPS) setsByMuscle[mg] = 0;

  let totalVolumeKg = 0;
  let totalWorkingSets = 0;
  let count = 0;

  for (const s of sessions) {
    if (s.startedAt.slice(0, 10) < cutoff) continue;
    count++;
    totalVolumeKg += s.totalVolumeKg;
    for (const ex of s.exercises) {
      const working = ex.sets.filter((st) => st.completed && st.setType !== 'warmup').length;
      setsByMuscle[ex.muscleGroup] = (setsByMuscle[ex.muscleGroup] ?? 0) + working;
      totalWorkingSets += working;
    }
  }

  const undertrained = Object.entries(setsByMuscle)
    .filter(([, sets]) => sets < 6)
    .map(([mg]) => mg);

  return { days, workoutsCount: count, totalWorkingSets, totalVolumeKg, setsByMuscle, undertrained };
}

export async function getWorkoutStatistics(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const sessions = await db.workoutSessions.toArray();
  const streak = calculateWorkoutStreak(sessions);
  const weekly = await getWeeklyTrainingVolume(auth, 7);
  return {
    totalWorkouts: sessions.length,
    currentStreak: streak.currentStreakDays,
    sessionsThisWeek: streak.sessionsThisWeek,
    weeklyVolumeKg: weekly.totalVolumeKg,
    weeklySetsByMuscle: weekly.setsByMuscle,
    undertrainedMuscles: weekly.undertrained,
  };
}

export async function suggestExerciseSubstitutions(
  auth: ToolAuthContext,
  exerciseQuery: string,
  equipmentAvailable?: string[]
) {
  assertAuthorized(auth);
  const exercises = await db.exercises.toArray();
  const q = exerciseQuery.trim().toLowerCase();
  const target = exercises.find((e) => e.name.toLowerCase().includes(q));
  if (!target) return { found: false, alternatives: [] };

  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const explicit = (target.alternatives ?? [])
    .map((id) => exMap.get(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const sameMuscle = exercises.filter(
    (e) =>
      e.id !== target.id &&
      e.muscleGroup === target.muscleGroup &&
      (!equipmentAvailable?.length || equipmentAvailable.includes(e.equipment))
  );

  const combined = Array.from(new Map([...explicit, ...sameMuscle].map((e) => [e.id, e])).values());
  return {
    found: true,
    original: target.name,
    muscleGroup: target.muscleGroup,
    alternatives: combined.slice(0, 4).map((a) => ({
      id: a.id,
      name: a.name,
      equipment: a.equipment,
      category: a.category,
      difficulty: a.difficulty,
    })),
  };
}

export async function suggestWorkoutModifications(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const [stats, recovery] = await Promise.all([
    getWorkoutStatistics(auth),
    getRecoverySummaryTool(auth),
  ]);
  const suggestions: string[] = [];
  if (recovery.score < 55) {
    suggestions.push('Recovery is low — trim 1 working set per compound movement or take a rest/deload day.');
  }
  if (stats.undertrainedMuscles.length > 0) {
    suggestions.push(
      `Weekly volume below 6 sets for: ${stats.undertrainedMuscles.join(', ')}. Add 2–3 direct sets next session.`
    );
  }
  return { recoveryScore: recovery.score, suggestions };
}

export async function generateWorkoutTool(
  auth: ToolAuthContext,
  focus: 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body'
): Promise<Routine> {
  assertAuthorized(auth);
  const profile = await db.profile.get(auth.profileId);
  const defaultRest = profile?.defaultRestSeconds ?? 90;

  const templates: Record<typeof focus, Omit<Routine, 'id'>> = {
    push: {
      name: 'AI Coach Push Hypertrophy',
      dayLabel: 'Push',
      programType: 'push',
      scheduledWeekdays: [1, 4],
      accentColor: '#B7F36B',
      items: [
        { exerciseId: 'ex-bench-press', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-incline-db-press', defaultSets: 3, restSeconds: defaultRest },
        { exerciseId: 'ex-db-shoulder-press', defaultSets: 3, restSeconds: defaultRest },
        { exerciseId: 'ex-lateral-raise', defaultSets: 3, restSeconds: 60 },
        { exerciseId: 'ex-tricep-pushdown', defaultSets: 3, restSeconds: 60 },
      ],
    },
    pull: {
      name: 'AI Coach Pull & Posterior Chain',
      dayLabel: 'Pull',
      programType: 'pull',
      scheduledWeekdays: [2, 5],
      accentColor: '#79B8F5',
      items: [
        { exerciseId: 'ex-pullups', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-barbell-row', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-seated-cable-row', defaultSets: 3, restSeconds: defaultRest },
        { exerciseId: 'ex-face-pull', defaultSets: 3, restSeconds: 60 },
        { exerciseId: 'ex-incline-db-curl', defaultSets: 3, restSeconds: 60 },
      ],
    },
    legs: {
      name: 'AI Coach Legs & Core',
      dayLabel: 'Legs',
      programType: 'legs',
      scheduledWeekdays: [3, 6],
      accentColor: '#EAB765',
      items: [
        { exerciseId: 'ex-squat', defaultSets: 3, restSeconds: 180 },
        { exerciseId: 'ex-rdl', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-bulgarian-split-squat', defaultSets: 3, restSeconds: defaultRest },
        { exerciseId: 'ex-leg-curl', defaultSets: 3, restSeconds: 60 },
        { exerciseId: 'ex-hanging-leg-raise', defaultSets: 3, restSeconds: 60 },
      ],
    },
    upper: {
      name: 'AI Coach Upper Strength',
      dayLabel: 'Upper',
      programType: 'upper',
      scheduledWeekdays: [1, 4],
      accentColor: '#B7F36B',
      items: [
        { exerciseId: 'ex-bench-press', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-barbell-row', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-ohp', defaultSets: 3, restSeconds: defaultRest },
        { exerciseId: 'ex-lat-pulldown', defaultSets: 3, restSeconds: defaultRest },
        { exerciseId: 'ex-hammer-curl', defaultSets: 3, restSeconds: 60 },
      ],
    },
    lower: {
      name: 'AI Coach Lower Hypertrophy',
      dayLabel: 'Lower',
      programType: 'lower',
      scheduledWeekdays: [2, 5],
      accentColor: '#79B8F5',
      items: [
        { exerciseId: 'ex-leg-press', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-rdl', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-leg-extension', defaultSets: 3, restSeconds: 60 },
        { exerciseId: 'ex-leg-curl', defaultSets: 3, restSeconds: 60 },
        { exerciseId: 'ex-standing-calf-raise', defaultSets: 3, restSeconds: 60 },
      ],
    },
    full_body: {
      name: 'AI Coach Full Body Balanced',
      dayLabel: 'Full Body',
      programType: 'full_body',
      scheduledWeekdays: [1, 3, 5],
      accentColor: '#75D69A',
      items: [
        { exerciseId: 'ex-squat', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-bench-press', defaultSets: 3, restSeconds: 120 },
        { exerciseId: 'ex-barbell-row', defaultSets: 3, restSeconds: defaultRest },
        { exerciseId: 'ex-lateral-raise', defaultSets: 3, restSeconds: 60 },
        { exerciseId: 'ex-cable-crunch', defaultSets: 3, restSeconds: 60 },
      ],
    },
  };

  return {
    id: `routine-ai-${Date.now()}`,
    ...templates[focus],
  };
}

// ---------------- NUTRITION TOOLS ----------------

export async function getTodayNutrition(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const todayKey = toLocalDateKey(new Date());
  const foods = await db.foodLogs.where('date').equals(todayKey).toArray();
  const totals = foods.reduce(
    (acc, f) => ({
      calories: acc.calories + f.calories,
      protein: acc.protein + f.protein,
      carbs: acc.carbs + f.carbs,
      fats: acc.fats + f.fats,
      fiber: acc.fiber + (f.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
  return { date: todayKey, count: foods.length, totals, foods };
}

export async function getCalorieTotals(auth: ToolAuthContext, days = 7) {
  assertAuthorized(auth);
  const todayKey = toLocalDateKey(new Date());
  const startKey = offsetDateKey(todayKey, -(Math.max(1, days) - 1));
  const foods = await db.foodLogs.where('date').aboveOrEqual(startKey).toArray();
  const byDate = new Map<string, number>();
  for (const f of foods) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.calories);
  const vals = Array.from(byDate.values());
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  return { days, loggedDays: vals.length, avgCalories: avg, dailyMap: Object.fromEntries(byDate) };
}

export async function getProteinTotals(auth: ToolAuthContext, days = 7) {
  assertAuthorized(auth);
  const todayKey = toLocalDateKey(new Date());
  const startKey = offsetDateKey(todayKey, -(Math.max(1, days) - 1));
  const foods = await db.foodLogs.where('date').aboveOrEqual(startKey).toArray();
  const byDate = new Map<string, number>();
  for (const f of foods) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.protein);
  const vals = Array.from(byDate.values());
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  return { days, loggedDays: vals.length, avgProteinG: avg };
}

export async function getMacroTotals(auth: ToolAuthContext) {
  const today = await getTodayNutrition(auth);
  return today.totals;
}

export async function getNutritionTargets(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const p = await db.profile.get(auth.profileId);
  if (!p) return null;
  return {
    calorieTarget: p.calorieTarget,
    proteinTarget: p.proteinTarget,
    carbsTarget: p.carbsTarget,
    fatsTarget: p.fatsTarget,
    fiberTarget: p.fiberTarget,
    waterGoalMl: p.waterGoalMl,
  };
}

export async function getRecentMeals(auth: ToolAuthContext, limit = 10) {
  assertAuthorized(auth);
  const all = await db.foodLogs.orderBy('createdAt').reverse().limit(limit).toArray();
  return all.map((f) => ({
    date: f.date,
    slot: f.mealSlot,
    name: f.name,
    serving: f.servingSize,
    calories: f.calories,
    protein: f.protein,
  }));
}

export async function searchFoodDatabase(auth: ToolAuthContext, query: string) {
  assertAuthorized(auth);
  const q = query.trim().toLowerCase();
  const custom = await db.customFoods.toArray();
  const dbMatches = OFFLINE_FOOD_DATABASE.filter(
    (f) =>
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      f.aliases.some((a) => a.includes(q))
  ).slice(0, 8);
  const customMatches = custom.filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 4);
  return { builtIn: dbMatches, custom: customMatches };
}

export async function suggestMeals(
  auth: ToolAuthContext,
  opts?: { ingredients?: string; budget?: boolean; bengaliOrIndian?: boolean }
) {
  assertAuthorized(auth);
  const [today, targets] = await Promise.all([
    getTodayNutrition(auth),
    getNutritionTargets(auth),
  ]);
  const remCal = (targets?.calorieTarget ?? 2400) - today.totals.calories;
  const remProt = Math.max(0, Math.round((targets?.proteinTarget ?? 150) - today.totals.protein));

  const pool = OFFLINE_FOOD_DATABASE.filter((f) => f.protein >= 10);
  const ing = opts?.ingredients?.toLowerCase() ?? '';
  const filtered = ing
    ? pool.filter((f) => ing.split(/[\s,]+/).some((w) => w.length > 2 && f.name.toLowerCase().includes(w)))
    : pool;

  return {
    remainingCalories: Math.round(remCal),
    remainingProteinG: remProt,
    highProteinOptions: (filtered.length > 0 ? filtered : pool)
      .sort((a, b) => b.protein / Math.max(1, b.calories) - a.protein / Math.max(1, a.calories))
      .slice(0, 5)
      .map((f) => ({
        name: f.name,
        servingSize: f.servingSize,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fats: f.fats,
      })),
  };
}

export function calculateRecipeMacros(items: ParsedFoodItem[], servingsYield = 1) {
  const div = Math.max(1, servingsYield);
  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fats: acc.fats + i.fats,
      fiber: acc.fiber + (i.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
  return {
    perServing: {
      calories: Math.round(totals.calories / div),
      protein: Math.round((totals.protein / div) * 10) / 10,
      carbs: Math.round((totals.carbs / div) * 10) / 10,
      fats: Math.round((totals.fats / div) * 10) / 10,
      fiber: Math.round((totals.fiber / div) * 10) / 10,
    },
  };
}

// ---------------- PROGRESS TOOLS ----------------

export async function getCurrentWeight(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const [profile, logs] = await Promise.all([
    db.profile.get(auth.profileId),
    db.weightLogs.orderBy('date').toArray(),
  ]);
  const latest = logs[logs.length - 1];
  const unit = profile?.unitSystem ?? 'metric';
  const weightKg = latest?.weightKg ?? profile?.weightKg ?? 0;
  return {
    weightKg,
    display: `${displayWeight(weightKg, unit, 1)} ${weightLabel(unit)}`,
    goalWeightKg: profile?.goalWeightKg ?? weightKg,
    date: latest?.date ?? null,
  };
}

export async function getWeightHistory(auth: ToolAuthContext, days = 30) {
  assertAuthorized(auth);
  const cutoff = offsetDateKey(toLocalDateKey(new Date()), -(Math.max(1, days) - 1));
  return db.weightLogs.where('date').aboveOrEqual(cutoff).toArray();
}

export async function calculateWeightTrend(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const logs = await db.weightLogs.orderBy('date').toArray();
  if (logs.length === 0) return { entries: 0, avg7Kg: null, avg30Kg: null, delta7dKg: 0 };
  const last7 = logs.slice(-7);
  const prev7 = logs.slice(-14, -7);
  const avg7 = last7.reduce((s, w) => s + w.weightKg, 0) / last7.length;
  const avgPrev7 = prev7.length ? prev7.reduce((s, w) => s + w.weightKg, 0) / prev7.length : logs[0].weightKg;
  const avg30 = logs.slice(-30).reduce((s, w) => s + w.weightKg, 0) / Math.min(30, logs.length);
  return {
    entries: logs.length,
    latestKg: logs[logs.length - 1].weightKg,
    avg7Kg: Math.round(avg7 * 100) / 100,
    avg30Kg: Math.round(avg30 * 100) / 100,
    delta7dKg: Math.round((avg7 - avgPrev7) * 100) / 100,
  };
}

export async function getBodyMeasurements(auth: ToolAuthContext) {
  assertAuthorized(auth);
  return db.measurements.orderBy('date').toArray();
}

export async function getStrengthProgression(auth: ToolAuthContext) {
  return getExercisePerformance(auth);
}

export async function generateProgressSummary(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const [weightTrend, workoutStats, cal7, prot7, measurements] = await Promise.all([
    calculateWeightTrend(auth),
    getWorkoutStatistics(auth),
    getCalorieTotals(auth, 7),
    getProteinTotals(auth, 7),
    getBodyMeasurements(auth),
  ]);
  return { weightTrend, workoutStats, nutrition7d: { cal7, prot7 }, measurementsCount: measurements.length };
}

// ---------------- RECOVERY TOOLS ----------------

export async function getSleepHistory(auth: ToolAuthContext, days = 7) {
  assertAuthorized(auth);
  const cutoff = offsetDateKey(toLocalDateKey(new Date()), -(Math.max(1, days) - 1));
  const logs = await db.recoveryLogs.where('date').aboveOrEqual(cutoff).toArray();
  return logs.map((r) => ({ date: r.date, sleepHours: r.sleepHours, sleepQuality: r.sleepQuality }));
}

export async function getStepsAndActivity(auth: ToolAuthContext, days = 7) {
  assertAuthorized(auth);
  const cutoff = offsetDateKey(toLocalDateKey(new Date()), -(Math.max(1, days) - 1));
  const logs = await db.recoveryLogs.where('date').aboveOrEqual(cutoff).toArray();
  return logs.map((r) => ({ date: r.date, steps: r.steps, activeMinutes: r.activeMinutes }));
}

export async function getWaterIntakeTool(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const todayKey = toLocalDateKey(new Date());
  const logs = await db.waterLogs.where('date').equals(todayKey).toArray();
  return { date: todayKey, totalMl: logs.reduce((s, w) => s + w.amountMl, 0) };
}

export async function getFatigueAndSoreness(auth: ToolAuthContext, days = 7) {
  assertAuthorized(auth);
  const cutoff = offsetDateKey(toLocalDateKey(new Date()), -(Math.max(1, days) - 1));
  const logs = await db.recoveryLogs.where('date').aboveOrEqual(cutoff).toArray();
  return logs.map((r) => ({
    date: r.date,
    fatigue: r.fatigue,
    soreness: r.soreness,
    stress: r.stress,
    mood: r.mood,
  }));
}

export async function getRecoverySummaryTool(auth: ToolAuthContext) {
  assertAuthorized(auth);
  const todayKey = toLocalDateKey(new Date());
  const sevenAgo = offsetDateKey(todayKey, -6);
  const [profile, recoveryLogs, todayWater, sessions] = await Promise.all([
    db.profile.get(DEFAULT_PROFILE_ID),
    db.recoveryLogs.orderBy('date').toArray(),
    getWaterIntakeTool(auth),
    db.workoutSessions.toArray(),
  ]);
  const latest = recoveryLogs[recoveryLogs.length - 1];
  const summary = calculateRecoverySummary(
    latest,
    profile?.sleepGoalHours ?? 7.5,
    todayWater.totalMl,
    profile?.waterGoalMl ?? 3000,
    sessions.filter((s) => s.startedAt.slice(0, 10) >= sevenAgo)
  );
  return {
    ...summary,
    latestDate: latest?.date ?? null,
    sleepHours: latest?.sleepHours ?? null,
    steps: latest?.steps ?? null,
    fatigue: latest?.fatigue ?? null,
    soreness: latest?.soreness ?? null,
    waterMl: todayWater.totalMl,
  };
}
