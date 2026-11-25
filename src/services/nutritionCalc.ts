import type { ActivityLevel, FitnessGoal, Sex } from '../types';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, { label: string; factor: number; detail: string }> = {
  sedentary: { label: 'Sedentary', factor: 1.2, detail: 'Desk job, minimal exercise' },
  light: { label: 'Lightly Active', factor: 1.375, detail: '1–3 workouts/week' },
  moderate: { label: 'Moderately Active', factor: 1.55, detail: '3–5 workouts/week' },
  active: { label: 'Very Active', factor: 1.725, detail: '6–7 workouts/week' },
  very_active: { label: 'Athlete', factor: 1.9, detail: '2x daily training / physical job' },
};

export const GOAL_CONFIG: Record<FitnessGoal, { label: string; calorieDelta: number; proteinPerKg: number; fatRatio: number }> = {
  cut: { label: 'Fat Loss (Cut)', calorieDelta: -450, proteinPerKg: 2.2, fatRatio: 0.25 },
  maintain: { label: 'Maintain & Recomp', calorieDelta: 0, proteinPerKg: 2.0, fatRatio: 0.28 },
  lean_bulk: { label: 'Lean Bulk', calorieDelta: 275, proteinPerKg: 2.0, fatRatio: 0.25 },
};

export interface MacroTargets {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatsTarget: number;
  fiberTarget: number;
}

export function calculateMacroTargets(params: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
}): MacroTargets {
  const { sex, age, heightCm, weightKg, activityLevel, goal } = params;
  const sexOffset = sex === 'male' ? 5 : -161;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel].factor);
  const goalCfg = GOAL_CONFIG[goal];

  const calorieTarget = Math.max(1200, Math.round((tdee + goalCfg.calorieDelta) / 10) * 10);
  const proteinTarget = Math.round(weightKg * goalCfg.proteinPerKg);
  const fatsTarget = Math.round((calorieTarget * goalCfg.fatRatio) / 9);
  const remainingCalories = Math.max(200, calorieTarget - proteinTarget * 4 - fatsTarget * 9);
  const carbsTarget = Math.round(remainingCalories / 4);
  const fiberTarget = Math.max(25, Math.round((calorieTarget / 1000) * 14));

  return {
    bmr,
    tdee,
    calorieTarget,
    proteinTarget,
    carbsTarget,
    fatsTarget,
    fiberTarget,
  };
}
