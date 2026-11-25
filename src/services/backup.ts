import { db } from '../db/database';
import type {
  BodyMeasurementEntry,
  CoachConversation,
  CoachMemory,
  CoachMessage,
  CustomFoodItem,
  Exercise,
  FoodLogEntry,
  ProgressPhotoEntry,
  RecoveryLogEntry,
  Routine,
  SavedMeal,
  UserProfile,
  WaterLogEntry,
  WeightLogEntry,
  WorkoutSession,
} from '../types';

export interface ApexFitBackup {
  version: 1 | 2 | 3;
  exportedAt: string;
  profile: UserProfile[];
  exercises: Exercise[];
  routines: Routine[];
  workoutSessions: WorkoutSession[];
  foodLogs: FoodLogEntry[];
  customFoods?: CustomFoodItem[];
  savedMeals?: SavedMeal[];
  waterLogs: WaterLogEntry[];
  weightLogs: WeightLogEntry[];
  measurements?: BodyMeasurementEntry[];
  progressPhotos?: ProgressPhotoEntry[];
  recoveryLogs?: RecoveryLogEntry[];
  coachMessages?: CoachMessage[];
  coachConversations?: CoachConversation[];
  coachMemories?: CoachMemory[];
}

export async function exportDatabaseToJson(): Promise<string> {
  const [
    profile,
    exercises,
    routines,
    workoutSessions,
    foodLogs,
    customFoods,
    savedMeals,
    waterLogs,
    weightLogs,
    measurements,
    progressPhotos,
    recoveryLogs,
    coachMessages,
    coachConversations,
    coachMemories,
  ] = await Promise.all([
    db.profile.toArray(),
    db.exercises.toArray(),
    db.routines.toArray(),
    db.workoutSessions.toArray(),
    db.foodLogs.toArray(),
    db.customFoods.toArray(),
    db.savedMeals.toArray(),
    db.waterLogs.toArray(),
    db.weightLogs.toArray(),
    db.measurements.toArray(),
    db.progressPhotos.toArray(),
    db.recoveryLogs.toArray(),
    db.coachMessages.toArray(),
    db.coachConversations.toArray(),
    db.coachMemories.toArray(),
  ]);

  const payload: ApexFitBackup = {
    version: 3,
    exportedAt: new Date().toISOString(),
    profile,
    exercises,
    routines,
    workoutSessions,
    foodLogs,
    customFoods,
    savedMeals,
    waterLogs,
    weightLogs,
    measurements,
    progressPhotos,
    recoveryLogs,
    coachMessages,
    coachConversations,
    coachMemories,
  };

  return JSON.stringify(payload, null, 2);
}

export async function importDatabaseFromJson(jsonString: string): Promise<{
  sessions: number;
  foods: number;
}> {
  const parsed = JSON.parse(jsonString) as Partial<ApexFitBackup>;
  if (
    !parsed ||
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) ||
    !Array.isArray(parsed.profile)
  ) {
    throw new Error('Invalid ApexFit backup JSON format.');
  }

  await db.transaction(
    'rw',
    [
      db.profile,
      db.exercises,
      db.routines,
      db.workoutSessions,
      db.foodLogs,
      db.customFoods,
      db.savedMeals,
      db.waterLogs,
      db.weightLogs,
      db.measurements,
      db.progressPhotos,
      db.recoveryLogs,
      db.coachMessages,
      db.coachConversations,
      db.coachMemories,
    ],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.exercises.clear(),
        db.routines.clear(),
        db.workoutSessions.clear(),
        db.foodLogs.clear(),
        db.customFoods.clear(),
        db.savedMeals.clear(),
        db.waterLogs.clear(),
        db.weightLogs.clear(),
        db.measurements.clear(),
        db.progressPhotos.clear(),
        db.recoveryLogs.clear(),
        db.coachMessages.clear(),
        db.coachConversations.clear(),
        db.coachMemories.clear(),
      ]);

      if (parsed.profile?.length) await db.profile.bulkPut(parsed.profile);
      if (parsed.exercises?.length) await db.exercises.bulkPut(parsed.exercises);
      if (parsed.routines?.length) await db.routines.bulkPut(parsed.routines);
      if (parsed.workoutSessions?.length) await db.workoutSessions.bulkPut(parsed.workoutSessions);
      if (parsed.foodLogs?.length) {
        await db.foodLogs.bulkPut(
          parsed.foodLogs.map((f) => ({ ...f, fiber: f.fiber ?? 0 }))
        );
      }
      if (parsed.customFoods?.length) await db.customFoods.bulkPut(parsed.customFoods);
      if (parsed.savedMeals?.length) await db.savedMeals.bulkPut(parsed.savedMeals);
      if (parsed.waterLogs?.length) await db.waterLogs.bulkPut(parsed.waterLogs);
      if (parsed.weightLogs?.length) await db.weightLogs.bulkPut(parsed.weightLogs);
      if (parsed.measurements?.length) await db.measurements.bulkPut(parsed.measurements);
      if (parsed.progressPhotos?.length) await db.progressPhotos.bulkPut(parsed.progressPhotos);
      if (parsed.recoveryLogs?.length) await db.recoveryLogs.bulkPut(parsed.recoveryLogs);
      if (parsed.coachMessages?.length) await db.coachMessages.bulkPut(parsed.coachMessages);
      if (parsed.coachConversations?.length)
        await db.coachConversations.bulkPut(parsed.coachConversations);
      if (parsed.coachMemories?.length) await db.coachMemories.bulkPut(parsed.coachMemories);
    }
  );

  return {
    sessions: parsed.workoutSessions?.length ?? 0,
    foods: parsed.foodLogs?.length ?? 0,
  };
}
