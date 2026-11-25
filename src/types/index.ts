export type MuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Legs' | 'Arms' | 'Core';

export type SetType = 'warmup' | 'working' | 'drop' | 'failure';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'custom';

export type FoodUnit = 'serving' | '100g' | 'piece' | 'bowl' | 'cup' | 'custom';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type FitnessGoal = 'cut' | 'maintain' | 'lean_bulk';

export type Sex = 'male' | 'female';

export type UnitSystem = 'metric' | 'imperial';

export type ProgramType =
  | 'push'
  | 'pull'
  | 'legs'
  | 'upper'
  | 'lower'
  | 'full_body'
  | 'custom';

export type ExerciseCategory = 'Compound' | 'Isolation' | 'Bodyweight' | 'Cardio';

export type ExerciseDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type DashboardWidgetId =
  | 'today_workout'
  | 'nutrition_summary'
  | 'hydration'
  | 'steps_sleep'
  | 'weight_energy'
  | 'weekly_activity'
  | 'recent_prs';

export type CoachMode =
  | 'workout'
  | 'nutrition'
  | 'recovery'
  | 'progress'
  | 'general';

export type AIProviderId = 'gemini' | 'groq' | 'openrouter' | 'local';

export type MemoryCategory =
  | 'profile'
  | 'training'
  | 'nutrition'
  | 'recovery'
  | 'conversation';

export interface CoachMemory {
  id: string;
  category: MemoryCategory;
  key: string;
  content: string;
  confidence: 'verified' | 'user_stated';
  createdAt: string;
  updatedAt: string;
}

export interface CoachConversation {
  id: string;
  title: string;
  mode: CoachMode;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  unitSystem: UnitSystem;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatsTarget: number;
  fiberTarget: number;
  waterGoalMl: number;
  stepsGoal: number;
  sleepGoalHours: number;
  defaultRestSeconds: number;
  trainingDaysPerWeek: number;
  preferredSplit: ProgramType;
  equipmentAvailable: string[];
  dashboardWidgets: DashboardWidgetId[];
  restSoundEnabled: boolean;
  restVibrateEnabled: boolean;
  privacyBlurPhotos: boolean;
  pinHash?: string;
  aiProvider?: AIProviderId;
  aiModel?: string;
  geminiApiKey: string;
  sampleDataSeeded: boolean;
  lastSyncedAt?: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment: string;
  category?: ExerciseCategory;
  difficulty?: ExerciseDifficulty;
  instructions?: string[];
  formCues?: string[];
  commonMistakes?: string[];
  alternatives?: string[];
  notes?: string;
  isCustom?: boolean;
}

export interface RoutineExerciseItem {
  exerciseId: string;
  defaultSets: number;
  restSeconds: number;
}

export interface Routine {
  id: string;
  name: string;
  dayLabel: string;
  programType?: ProgramType;
  scheduledWeekdays?: number[]; // 0=Sun..6=Sat
  accentColor: string;
  items: RoutineExerciseItem[];
  lastPerformedAt?: string;
}

export interface WorkoutSetLog {
  id: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  setType: SetType;
  completed: boolean;
  isPRWeight?: boolean;
  isPR1RM?: boolean;
  isPRVolume?: boolean;
}

export interface WorkoutExerciseLog {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  restSeconds: number;
  notes?: string;
  sets: WorkoutSetLog[];
}

export interface WorkoutSession {
  id: string;
  routineId?: string;
  routineName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  totalVolumeKg: number;
  notes?: string;
  exercises: WorkoutExerciseLog[];
}

export interface ActiveWorkoutDraft {
  id: string;
  routineId?: string;
  routineName: string;
  startedAt: string;
  notes: string;
  exercises: WorkoutExerciseLog[];
}

export interface FoodLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mealSlot: MealSlot;
  customMealName?: string;
  name: string;
  servingSize: string;
  unit?: FoodUnit;
  quantity?: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  source: 'ai' | 'offline' | 'manual' | 'recipe';
  createdAt: string;
}

export interface ParsedFoodItem {
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
}

export interface CustomFoodItem extends ParsedFoodItem {
  id: string;
  category: string;
  baseUnit: FoodUnit;
  gramsPerServing?: number;
  createdAt: string;
}

export interface SavedMeal {
  id: string;
  name: string;
  isRecipe: boolean;
  servingsYield: number;
  items: ParsedFoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  totalFiber: number;
  createdAt: string;
}

export interface WaterLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  amountMl: number;
  createdAt: string;
}

export interface WeightLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  note?: string;
}

export interface BodyMeasurementEntry {
  id: string;
  date: string; // YYYY-MM-DD
  chestCm?: number;
  waistCm?: number;
  shouldersCm?: number;
  armsCm?: number;
  forearmsCm?: number;
  hipsCm?: number;
  thighsCm?: number;
  calvesCm?: number;
  neckCm?: number;
  custom?: Record<string, number>;
}

export type PhotoPose = 'front' | 'side' | 'back';

export interface ProgressPhotoEntry {
  id: string;
  date: string; // YYYY-MM-DD
  pose: PhotoPose;
  dataUrl: string;
  weightKg?: number;
  note?: string;
  createdAt: string;
}

export interface RecoveryLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  sleepHours: number;
  sleepQuality: number; // 1-5
  steps: number;
  activeMinutes: number;
  fatigue: number; // 1-5 (1 low, 5 high)
  soreness: number; // 1-5
  stress: number; // 1-5
  mood: number; // 1-5
  habits: Record<string, boolean>;
  note?: string;
}

export interface CoachProposedAction {
  type: 'create_routine' | 'update_targets';
  label: string;
  payload: unknown;
}

export interface CoachMessage {
  id: string;
  conversationId: string;
  mode: CoachMode;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  contextUsed?: string[];
  providerUsed?: string;
  error?: string;
  proposedAction?: CoachProposedAction;
  actionApplied?: boolean;
}

export type SyncEntityType =
  | 'profile'
  | 'routine'
  | 'exercise'
  | 'workoutSession'
  | 'foodLog'
  | 'customFood'
  | 'savedMeal'
  | 'waterLog'
  | 'weightLog'
  | 'measurement'
  | 'progressPhoto'
  | 'recoveryLog';

export interface SyncQueueItem {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  action: 'upsert' | 'delete';
  payloadHash: string;
  payload?: unknown;
  status: 'pending' | 'synced' | 'conflict';
  retries: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}
