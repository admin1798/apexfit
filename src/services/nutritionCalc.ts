import type { ActivityLevel, FitnessGoal, Sex } from '../types';

export const ACTIVITY_MULTIPLIERS: Record<
  ActivityLevel,
  { label: string; factor: number; detail: string }
> = {
  sedentary: { label: 'Sedentary', factor: 1.2, detail: 'Desk job, minimal exercise' },
  light: { label: 'Lightly Active', factor: 1.375, detail: '1–3 workouts/week' },
  moderate: { label: 'Moderately Active', factor: 1.55, detail: '3–5 workouts/week' },
  active: { label: 'Very Active', factor: 1.725, detail: '6–7 workouts/week' },
  very_active: { label: 'Athlete', factor: 1.9, detail: '2x daily training / physical job' },
};

export const GOAL_CONFIG: Record<
  FitnessGoal,
  {
    label: string;
    shortLabel: string;
    calorieDelta: number;
    defaultWeeklyRateKg: number;
    proteinPerKg: number;
    fatRatio: number;
  }
> = {
  cut: {
    label: 'Fat Loss (Cut)',
    shortLabel: 'Cut',
    calorieDelta: -500,
    defaultWeeklyRateKg: -0.5,
    proteinPerKg: 2.2,
    fatRatio: 0.25,
  },
  lean_bulk: {
    label: 'Muscle Gain (Lean Bulk)',
    shortLabel: 'Lean Bulk',
    calorieDelta: 275,
    defaultWeeklyRateKg: 0.25,
    proteinPerKg: 2.0,
    fatRatio: 0.25,
  },
  recomp: {
    label: 'Body Recomposition',
    shortLabel: 'Recomp',
    calorieDelta: -100,
    defaultWeeklyRateKg: -0.1,
    proteinPerKg: 2.2,
    fatRatio: 0.26,
  },
  maintain: {
    label: 'Maintain & Strength',
    shortLabel: 'Maintain',
    calorieDelta: 0,
    defaultWeeklyRateKg: 0,
    proteinPerKg: 2.0,
    fatRatio: 0.28,
  },
};

export interface MacroTargets {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatsTarget: number;
  fiberTarget: number;
  waterGoalMl: number;
}

export function computeRecommendedWaterMl(weightKg: number): number {
  return Math.max(1800, Math.round((weightKg * 35) / 100) * 100);
}

export function calculateMacroTargets(params: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  weeklyRateKg?: number;
}): MacroTargets {
  const { sex, age, heightCm, weightKg, activityLevel, goal, weeklyRateKg } = params;
  const sexOffset = sex === 'male' ? 5 : -161;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel].factor);
  const goalCfg = GOAL_CONFIG[goal] ?? GOAL_CONFIG.maintain;

  // 1 kg body weight ≈ 7,700 kcal -> daily delta ≈ weeklyRateKg * 1100
  const calorieDelta =
    weeklyRateKg !== undefined ? Math.round(weeklyRateKg * 1100) : goalCfg.calorieDelta;

  const calorieTarget = Math.max(1200, Math.round((tdee + calorieDelta) / 10) * 10);
  const proteinTarget = Math.round(weightKg * goalCfg.proteinPerKg);
  const fatsTarget = Math.round((calorieTarget * goalCfg.fatRatio) / 9);
  const remainingCalories = Math.max(200, calorieTarget - proteinTarget * 4 - fatsTarget * 9);
  const carbsTarget = Math.round(remainingCalories / 4);
  const fiberTarget = Math.max(25, Math.round((calorieTarget / 1000) * 14));
  const waterGoalMl = computeRecommendedWaterMl(weightKg);

  return {
    bmr,
    tdee,
    calorieTarget,
    proteinTarget,
    carbsTarget,
    fatsTarget,
    fiberTarget,
    waterGoalMl,
  };
}
