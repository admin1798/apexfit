import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import type { CoachMemory, MemoryCategory } from '../../types';

/**
 * Synchronizes verified baseline memories from actual stored ApexFit records
 * without duplicating entries (key-based upsert).
 */
export async function syncBaselineMemories(): Promise<void> {
  const [profile, routines, sessions] = await Promise.all([
    db.profile.get(DEFAULT_PROFILE_ID),
    db.routines.toArray(),
    db.workoutSessions.toArray(),
  ]);
  if (!profile) return;

  const now = new Date().toISOString();
  const candidates: Array<{
    category: MemoryCategory;
    key: string;
    content: string;
    confidence: 'verified' | 'user_stated';
  }> = [
    {
      category: 'profile',
      key: 'profile_goal_stats',
      content: `Age ${profile.age}, ${profile.heightCm}cm, ${profile.weightKg}kg (Goal: ${profile.goalWeightKg}kg, ${profile.goal}), training ${profile.trainingDaysPerWeek}x/week.`,
      confidence: 'verified',
    },
    {
      category: 'profile',
      key: 'equipment_available',
      content: `Available equipment: ${(profile.equipmentAvailable ?? []).join(', ') || 'Standard gym'}.`,
      confidence: 'verified',
    },
    {
      category: 'nutrition',
      key: 'nutrition_targets',
      content: `Daily targets: ${profile.calorieTarget} kcal, ${profile.proteinTarget}g protein, ${profile.carbsTarget}g carbs, ${profile.fatsTarget}g fats, ${profile.fiberTarget}g fiber.`,
      confidence: 'verified',
    },
  ];

  if (routines.length > 0) {
    candidates.push({
      category: 'training',
      key: 'active_split',
      content: `Saved programs (${routines.length}): ${routines.map((r) => r.dayLabel).join(', ')}.`,
      confidence: 'verified',
    });
  }

  if (sessions.length > 0) {
    const freqMap = new Map<string, number>();
    for (const s of sessions) {
      for (const ex of s.exercises) {
        freqMap.set(ex.exerciseName, (freqMap.get(ex.exerciseName) ?? 0) + 1);
      }
    }
    const topEx = Array.from(freqMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    if (topEx.length > 0) {
      candidates.push({
        category: 'training',
        key: 'frequent_exercises',
        content: `Frequently performed lifts: ${topEx.join(', ')}.`,
        confidence: 'verified',
      });
    }
  }

  for (const item of candidates) {
    const existing = await db.coachMemories.where('key').equals(item.key).first();
    if (existing && existing.content === item.content) continue;
    await db.coachMemories.put({
      id: existing?.id ?? `mem-${item.key}`,
      category: item.category,
      key: item.key,
      content: item.content,
      confidence: item.confidence,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }
}

/**
 * Extracts structured, non-duplicate long-term fitness memories from user statements
 * (e.g. injuries/limitations, dietary preferences, disliked foods, equipment limits, time constraints).
 */
export async function extractAndStoreMemoryFromMessage(userMessage: string): Promise<CoachMemory | null> {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  if (text.length < 10) return null;

  const detectedList: Array<{ category: MemoryCategory; key: string; content: string }> = [];

  if (/\b(hurts?|pain|injury|injured|tweaked|aches?|avoid|cannot do|can't do)\b/.test(lower)) {
    detectedList.push({
      category: 'training',
      key: `limitation_${lower.includes('shoulder') ? 'shoulder' : lower.includes('knee') ? 'knee' : lower.includes('back') ? 'back' : 'general'}`,
      content: `Training limitation noted by user: "${text.slice(0, 140)}"`,
    });
  }
  if (/\b(vegetarian|vegan|eggetarian|pescatarian|bengali|don't eat|do not eat|dislike|allergic|lactose)\b/.test(lower)) {
    detectedList.push({
      category: 'nutrition',
      key: `diet_pref_${lower.includes('veg') ? 'diet_type' : lower.includes('dislike') || lower.includes("don't eat") ? 'dislikes' : 'preference'}`,
      content: `Dietary preference/restriction: "${text.slice(0, 140)}"`,
    });
  }
  if (/\b(prefer|only have|minutes|home gym|dumbbells only|morning workout|evening workout)\b/.test(lower)) {
    detectedList.push({
      category: 'conversation',
      key: `pref_${lower.includes('minute') ? 'session_duration' : lower.includes('home') ? 'gym_setup' : 'training_pref'}`,
      content: `User stated preference: "${text.slice(0, 140)}"`,
    });
  }
  if (/\b(sleep poorly|insomnia|stressed|always sore|exhausted)\b/.test(lower)) {
    detectedList.push({
      category: 'recovery',
      key: 'recovery_pattern',
      content: `Recurring recovery observation: "${text.slice(0, 140)}"`,
    });
  }

  if (detectedList.length === 0) return null;

  const now = new Date().toISOString();
  let lastEntry: CoachMemory | null = null;
  for (const detected of detectedList) {
    const existing = await db.coachMemories.where('key').equals(detected.key).first();
    const entry: CoachMemory = {
      id: existing?.id ?? `mem-${detected.key}`,
      category: detected.category,
      key: detected.key,
      content: detected.content,
      confidence: 'user_stated',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.coachMemories.put(entry);
    lastEntry = entry;
  }
  return lastEntry;
}

export async function retrieveRelevantMemories(query: string, limit = 8): Promise<CoachMemory[]> {
  const all = await db.coachMemories.orderBy('updatedAt').reverse().toArray();
  const qWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return [...all]
    .sort((a, b) => {
      const aHits = qWords.filter((w) => a.content.toLowerCase().includes(w)).length;
      const bHits = qWords.filter((w) => b.content.toLowerCase().includes(w)).length;
      if (aHits !== bHits) return bHits - aHits;
      if (a.confidence !== b.confidence) return a.confidence === 'user_stated' ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, limit);
}

export async function upsertManualMemory(params: {
  id?: string;
  category: MemoryCategory;
  key: string;
  content: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const cleanKey = params.key.trim().toLowerCase().replace(/\s+/g, '_') || `note_${Date.now()}`;
  const existing = params.id ? await db.coachMemories.get(params.id) : undefined;
  await db.coachMemories.put({
    id: existing?.id ?? `mem-${cleanKey}-${Date.now()}`,
    category: params.category,
    key: cleanKey,
    content: params.content.trim(),
    confidence: 'user_stated',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function deleteMemory(id: string): Promise<void> {
  await db.coachMemories.delete(id);
}
