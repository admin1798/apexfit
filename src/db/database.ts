import Dexie, { type Table } from 'dexie';
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
  SyncQueueItem,
  UserProfile,
  WaterLogEntry,
  WeightLogEntry,
  WorkoutSession,
} from '../types';

export class ApexFitDB extends Dexie {
  profile!: Table<UserProfile, string>;
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  foodLogs!: Table<FoodLogEntry, string>;
  customFoods!: Table<CustomFoodItem, string>;
  savedMeals!: Table<SavedMeal, string>;
  waterLogs!: Table<WaterLogEntry, string>;
  weightLogs!: Table<WeightLogEntry, string>;
  measurements!: Table<BodyMeasurementEntry, string>;
  progressPhotos!: Table<ProgressPhotoEntry, string>;
  recoveryLogs!: Table<RecoveryLogEntry, string>;
  coachMessages!: Table<CoachMessage, string>;
  coachConversations!: Table<CoachConversation, string>;
  coachMemories!: Table<CoachMemory, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('apexfit_db');
    this.version(1).stores({
      profile: 'id',
      exercises: 'id, name, muscleGroup',
      routines: 'id, name',
      workoutSessions: 'id, routineId, startedAt',
      foodLogs: 'id, date, mealSlot, createdAt',
      waterLogs: 'id, date, createdAt',
      weightLogs: 'id, date',
    });

    this.version(2).stores({
      profile: 'id',
      exercises: 'id, name, muscleGroup',
      routines: 'id, name, programType',
      workoutSessions: 'id, routineId, startedAt',
      foodLogs: 'id, date, mealSlot, createdAt',
      customFoods: 'id, name, category',
      savedMeals: 'id, name, isRecipe',
      waterLogs: 'id, date, createdAt',
      weightLogs: 'id, date',
      measurements: 'id, date',
      progressPhotos: 'id, date, pose',
      recoveryLogs: 'id, date',
      coachMessages: 'id, mode, createdAt',
      syncQueue: 'id, entityType, entityId, status, updatedAt',
    });

    this.version(3)
      .stores({
        profile: 'id',
        exercises: 'id, name, muscleGroup',
        routines: 'id, name, programType',
        workoutSessions: 'id, routineId, startedAt',
        foodLogs: 'id, date, mealSlot, createdAt',
        customFoods: 'id, name, category',
        savedMeals: 'id, name, isRecipe',
        waterLogs: 'id, date, createdAt',
        weightLogs: 'id, date',
        measurements: 'id, date',
        progressPhotos: 'id, date, pose',
        recoveryLogs: 'id, date',
        coachMessages: 'id, conversationId, mode, createdAt',
        coachConversations: 'id, mode, updatedAt',
        coachMemories: 'id, category, key, updatedAt',
        syncQueue: 'id, entityType, entityId, status, updatedAt',
      })
      .upgrade(async (tx) => {
        const defaultConvId = 'conv-default';
        const existingMsgs = await tx.table('coachMessages').toArray();
        if (existingMsgs.length > 0) {
          const now = new Date().toISOString();
          await tx.table('coachConversations').put({
            id: defaultConvId,
            title: 'Previous Coaching Thread',
            mode: existingMsgs[0]?.mode ?? 'general',
            createdAt: existingMsgs[0]?.createdAt ?? now,
            updatedAt: existingMsgs[existingMsgs.length - 1]?.createdAt ?? now,
          });
          for (const msg of existingMsgs) {
            if (!msg.conversationId) {
              await tx.table('coachMessages').update(msg.id, { conversationId: defaultConvId });
            }
          }
        }
      });

    this.version(4)
      .stores({
        profile: 'id',
        exercises: 'id, name, muscleGroup',
        routines: 'id, name, programType',
        workoutSessions: 'id, routineId, startedAt',
        foodLogs: 'id, date, mealSlot, createdAt',
        customFoods: 'id, name, category',
        savedMeals: 'id, name, isRecipe',
        waterLogs: 'id, date, createdAt',
        weightLogs: 'id, date',
        measurements: 'id, date',
        progressPhotos: 'id, date, pose',
        recoveryLogs: 'id, date',
        coachMessages: 'id, conversationId, mode, createdAt',
        coachConversations: 'id, mode, updatedAt',
        coachMemories: 'id, category, key, updatedAt',
        syncQueue: 'id, entityType, entityId, status, updatedAt',
      })
      .upgrade(async (tx) => {
        const profiles = await tx.table('profile').toArray();
        const sessionsCount = await tx.table('workoutSessions').count();
        const foodsCount = await tx.table('foodLogs').count();
        for (const p of profiles) {
          if (p.onboardingCompleted === undefined) {
            await tx.table('profile').update(p.id, {
              onboardingCompleted: p.sampleDataSeeded || sessionsCount > 0 || foodsCount > 0,
              weeklyRateKg: p.weeklyRateKg ?? 0.25,
              experienceLevel: p.experienceLevel ?? 'intermediate',
              dietType: p.dietType ?? 'bengali_indian',
              preferredWorkoutSplit: p.preferredWorkoutSplit ?? 'push_pull_legs',
            });
          }
        }
      });
  }
}

export const db = new ApexFitDB();
