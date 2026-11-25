import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import type { CoachMemory, CoachMode } from '../../types';
import { retrieveRelevantMemories } from './memoryService';
import {
  calculateWeightTrend,
  generateProgressSummary,
  getBodyMeasurements,
  getCalorieTotals,
  getCurrentProgram,
  getCurrentWeight,
  getExerciseHistory,
  getExercisePerformance,
  getFatigueAndSoreness,
  getNutritionTargets,
  getPersonalRecords,
  getProteinTotals,
  getRecentMeals,
  getRecentWorkouts,
  getRecoverySummaryTool,
  getSleepHistory,
  getStepsAndActivity,
  getTodayNutrition,
  getTodayWorkout,
  getWaterIntakeTool,
  getWeeklyTrainingVolume,
  getWorkoutStatistics,
  searchFoodDatabase,
  suggestExerciseSubstitutions,
  suggestMeals,
  type ToolAuthContext,
} from './tools';

export interface RetrievedCoachContext {
  contextTags: string[];
  memories: CoachMemory[];
  data: Record<string, unknown>;
}

/**
 * Selective context retriever: runs only the tools relevant to the user's question and mode
 * so we never send the entire database on every LLM request.
 */
export async function retrieveRelevantContext(
  auth: ToolAuthContext,
  mode: CoachMode,
  query: string
): Promise<RetrievedCoachContext> {
  const q = query.toLowerCase();
  const profile = await db.profile.get(DEFAULT_PROFILE_ID);
  const memories = await retrieveRelevantMemories(query, 6);

  const contextTags: string[] = [];
  if (memories.length > 0) contextTags.push('AI Memory');

  const data: Record<string, unknown> = {
    profileSummary: profile
      ? {
          age: profile.age,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          goalWeightKg: profile.goalWeightKg,
          goal: profile.goal,
          unitSystem: profile.unitSystem,
          trainingDaysPerWeek: profile.trainingDaysPerWeek,
          equipmentAvailable: profile.equipmentAvailable,
        }
      : null,
    memories: memories.map((m) => ({ category: m.category, content: m.content })),
  };

  const isWorkoutIntent =
    mode === 'workout' ||
    /\b(workout|train|split|bench|squat|row|pull|push|legs|sets|reps|overload|volume|substitute|replace|alternative|pr|record)\b/.test(
      q
    );
  const isNutritionIntent =
    mode === 'nutrition' ||
    /\b(eat|food|meal|protein|calorie|macro|dinner|lunch|breakfast|recipe|chicken|egg|paneer|dal|fish|rice|roti|bengali|budget|cheap)\b/.test(
      q
    );
  const isRecoveryIntent =
    mode === 'recovery' ||
    /\b(sleep|rest|deload|fatigue|sore|soreness|recovery|stress|steps|water|hydrat|pain|hurt)\b/.test(
      q
    );
  const isProgressIntent =
    mode === 'progress' ||
    /\b(weight|trend|progress|report|weekly|monthly|measurement|waist|consistency|stagnat)\b/.test(
      q
    );

  // Fallback to balanced summary for general queries with no narrow keyword
  const runAllCore = !isWorkoutIntent && !isNutritionIntent && !isRecoveryIntent && !isProgressIntent;

  if (isWorkoutIntent || runAllCore) {
    contextTags.push('Workout history');
    const [todayWorkout, programs, recentWorkouts, stats, perf, prs] = await Promise.all([
      getTodayWorkout(auth),
      getCurrentProgram(auth),
      getRecentWorkouts(auth, 4),
      getWorkoutStatistics(auth),
      getExercisePerformance(auth),
      getPersonalRecords(auth),
    ]);
    data.todayWorkout = todayWorkout;
    data.programs = programs.map((p) => ({
      name: p.name,
      dayLabel: p.dayLabel,
      programType: p.programType,
      exercisesCount: p.items.length,
    }));
    data.recentWorkouts = recentWorkouts;
    data.workoutStats = stats;
    data.exercisePerformance = perf;
    data.recentPRs = prs.slice(0, 5);

    if (q.includes('bench') || q.includes('squat') || q.includes('row') || q.includes('press')) {
      const term = q.includes('bench')
        ? 'bench'
        : q.includes('squat')
          ? 'squat'
          : q.includes('row')
            ? 'row'
            : 'press';
      data.specificExerciseHistory = await getExerciseHistory(auth, term);
      if (q.includes('substit') || q.includes('replace') || q.includes('alternative') || q.includes('unavailable')) {
        data.substitutions = await suggestExerciseSubstitutions(
          auth,
          term,
          profile?.equipmentAvailable
        );
      }
    }
  }

  if (isNutritionIntent || runAllCore) {
    contextTags.push('Nutrition today');
    const [todayNutrition, targets, cal7, prot7, recentMeals, mealSuggestions] = await Promise.all([
      getTodayNutrition(auth),
      getNutritionTargets(auth),
      getCalorieTotals(auth, 7),
      getProteinTotals(auth, 7),
      getRecentMeals(auth, 8),
      suggestMeals(auth, {
        ingredients: q,
        budget: q.includes('cheap') || q.includes('budget'),
        bengaliOrIndian: true,
      }),
    ]);
    data.todayNutrition = todayNutrition;
    data.nutritionTargets = targets;
    data.nutrition7dAvg = { avgCalories: cal7.avgCalories, avgProteinG: prot7.avgProteinG, loggedDays: cal7.loggedDays };
    data.recentMeals = recentMeals;
    data.mealSuggestions = mealSuggestions;

    if (/\b(egg|chicken|fish|paneer|soya|dal|roti|rice|oats)\b/.test(q)) {
      const kw = q.match(/\b(egg|chicken|fish|paneer|soya|dal|roti|rice|oats)\b/)?.[1] ?? '';
      data.foodSearchMatches = await searchFoodDatabase(auth, kw);
    }
  }

  if (isRecoveryIntent || runAllCore) {
    contextTags.push('Recovery');
    const [recoverySummary, sleepHistory, stepsActivity, fatigueSoreness, water] = await Promise.all([
      getRecoverySummaryTool(auth),
      getSleepHistory(auth, 7),
      getStepsAndActivity(auth, 7),
      getFatigueAndSoreness(auth, 7),
      getWaterIntakeTool(auth),
    ]);
    data.recoverySummary = recoverySummary;
    data.sleep7d = sleepHistory;
    data.steps7d = stepsActivity;
    data.fatigueSoreness7d = fatigueSoreness;
    data.waterToday = water;
  }

  if (isProgressIntent || runAllCore) {
    contextTags.push('Weight trend');
    const [currentWeight, weightTrend, measurements, weeklyVolume, progressSummary] = await Promise.all([
      getCurrentWeight(auth),
      calculateWeightTrend(auth),
      getBodyMeasurements(auth),
      getWeeklyTrainingVolume(auth, 7),
      generateProgressSummary(auth),
    ]);
    data.currentWeight = currentWeight;
    data.weightTrend = weightTrend;
    data.measurements = measurements.slice(-3);
    data.weeklyVolume = weeklyVolume;
    data.progressSummary = progressSummary;
  }

  return {
    contextTags: Array.from(new Set(contextTags)),
    memories,
    data,
  };
}
