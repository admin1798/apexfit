import { OFFLINE_FOOD_DATABASE, parseMealOffline } from '../../data/offlineFoods';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { parseMealWithGemini } from '../geminiFoodParser';
import { enqueueSyncMutation } from '../syncService';
import {
  calculateSessionVolume,
  stampPersonalRecords,
  toLocalDateKey,
} from '../workoutMetrics';
import type {
  ActiveWorkoutDraft,
  CoachProposedAction,
  Exercise,
  FoodLogEntry,
  MealSlot,
  ParsedFoodItem,
  Routine,
  WorkoutSession,
  WorkoutSetLog,
} from '../../types';

export interface ActiveWorkoutBridge {
  activeDraft: ActiveWorkoutDraft | null;
  onUpdateDraft: (next: ActiveWorkoutDraft | null) => void;
}

export interface ActionExecutionOutcome {
  handled: boolean;
  immediateToast?: {
    message: string;
    undo: () => Promise<void>;
  };
  assistantContent: string;
  contextUsed: string[];
  providerUsed: string;
  proposedAction?: CoachProposedAction;
}

function detectMealSlot(text: string): MealSlot {
  const q = text.toLowerCase();
  if (q.includes('breakfast') || q.includes('morning')) return 'breakfast';
  if (q.includes('lunch') || q.includes('afternoon')) return 'lunch';
  if (q.includes('dinner') || q.includes('night') || q.includes('tonight')) return 'dinner';
  if (q.includes('snack') || q.includes('pre-workout') || q.includes('post-workout')) return 'snacks';
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snacks';
  return 'dinner';
}

function findBestExerciseMatch(query: string, exercises: Exercise[]): Exercise | undefined {
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  if (!q) return undefined;

  // Exact or substring match scored by overlap
  let best: Exercise | undefined;
  let bestScore = 0;

  for (const ex of exercises) {
    const name = ex.name.toLowerCase();
    if (name === q) return ex;
    if (name.includes(q) || q.includes(name)) {
      const score = Math.min(name.length, q.length) + 20;
      if (score > bestScore) {
        bestScore = score;
        best = ex;
      }
      continue;
    }
    const qWords = q.split(/\s+/).filter((w) => w.length > 2);
    const hits = qWords.filter((w) => name.includes(w)).length;
    if (hits > 0) {
      const score = hits * 10 - Math.abs(name.split(/\s+/).length - qWords.length);
      if (score > bestScore) {
        bestScore = score;
        best = ex;
      }
    }
  }
  return best;
}

function parseSetsFromText(text: string): Array<{ weightKg: number; reps: number }> {
  const sets: Array<{ weightKg: number; reps: number }> = [];
  // Matches e.g. "60kg x 10", "65 kg × 8", "70x6", "135 lb x 8"
  const pairRegex = /(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?\s*[x×*]\s*(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pairRegex.exec(text)) !== null) {
    const rawW = parseFloat(match[1]);
    const unitHint = (match[2] ?? 'kg').toLowerCase();
    const reps = parseInt(match[3], 10);
    if (!Number.isFinite(rawW) || !Number.isFinite(reps) || reps <= 0) continue;
    const weightKg = unitHint.startsWith('lb') ? Math.round((rawW / 2.20462) * 10) / 10 : rawW;
    sets.push({ weightKg, reps });
  }

  // Handle "3 sets of X at 60kg for 10 reps" fallback if no NxM pairs found
  if (sets.length === 0) {
    const countMatch = text.match(/(\d+)\s*sets?/i);
    const wMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)/i);
    const rMatch = text.match(/(\d+)\s*reps?/i);
    const count = Math.min(10, Math.max(1, countMatch ? parseInt(countMatch[1], 10) : 3));
    const rawW = wMatch ? parseFloat(wMatch[1]) : 0;
    const weightKg = wMatch?.[2]?.toLowerCase().startsWith('lb')
      ? Math.round((rawW / 2.20462) * 10) / 10
      : rawW;
    const reps = rMatch ? parseInt(rMatch[1], 10) : 10;
    if (countMatch || wMatch) {
      for (let i = 0; i < count; i++) {
        sets.push({ weightKg, reps });
      }
    }
  }
  return sets;
}

async function parseFoodPhrase(phrase: string): Promise<{ items: ParsedFoodItem[]; source: 'ai' | 'offline' }> {
  const profile = await db.profile.get(DEFAULT_PROFILE_ID);
  const apiKey = profile?.geminiApiKey?.trim() ?? '';

  if (apiKey && navigator.onLine) {
    try {
      const items = await parseMealWithGemini(phrase, apiKey);
      if (items.length > 0) return { items, source: 'ai' };
    } catch {
      // Fallback gracefully to offline food parser
    }
  }

  const offlineItems = parseMealOffline(phrase);
  if (offlineItems.length > 0) {
    return { items: offlineItems, source: 'offline' };
  }

  // Last-resort match against individual tokens in OFFLINE_FOOD_DATABASE
  const lower = phrase.toLowerCase();
  const fuzzy = OFFLINE_FOOD_DATABASE.find(
    (f) => f.name.toLowerCase().includes(lower) || f.aliases.some((a) => lower.includes(a))
  );
  if (fuzzy) {
    return {
      items: [
        {
          name: fuzzy.name,
          servingSize: fuzzy.servingSize,
          calories: fuzzy.calories,
          protein: fuzzy.protein,
          carbs: fuzzy.carbs,
          fats: fuzzy.fats,
          fiber: fuzzy.fiber,
        },
      ],
      source: 'offline',
    };
  }
  return { items: [], source: 'offline' };
}

/**
 * Parses and executes (or prepares confirmation for) user natural-language mutations
 * against Dexie foodLogs, workoutSessions, routines, and activeDraft.
 */
export async function detectAndHandleMutationCommand(
  userPrompt: string,
  bridge?: ActiveWorkoutBridge
): Promise<ActionExecutionOutcome | null> {
  const text = userPrompt.trim();
  const q = text.toLowerCase();
  const todayKey = toLocalDateKey(new Date());

  // ------------------------------------------------------------------
  // 1. DELETE MEAL: "Remove the mishti doi I logged earlier"
  // ------------------------------------------------------------------
  if (/^(remove|delete|undo|clear)\b/.test(q) && !q.includes('routine') && !q.includes('exercise')) {
    const todayFoods = await db.foodLogs.where('date').equals(todayKey).toArray();
    if (todayFoods.length === 0) {
      return {
        handled: true,
        assistantContent: 'No food logs found for today to remove.',
        contextUsed: ['Nutrition today'],
        providerUsed: 'ApexFit Action Engine',
      };
    }

    const cleanWords = q
      .replace(/\b(remove|delete|the|my|that|i|logged|earlier|today|from|lunch|dinner|breakfast|snacks?|meal|food)\b/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const matched = todayFoods.find((f) =>
      cleanWords.some((w) => f.name.toLowerCase().includes(w))
    );

    if (matched) {
      return {
        handled: true,
        assistantContent: `Found **${matched.name}** (${matched.servingSize}, ${matched.calories} kcal) in today's **${matched.mealSlot}**. Confirm below to delete this entry.`,
        contextUsed: ['Nutrition today'],
        providerUsed: 'ApexFit Action Engine',
        proposedAction: {
          type: 'delete_meal',
          label: `Delete "${matched.name}" (${matched.calories} kcal)`,
          requiresConfirmation: true,
          payload: { foodId: matched.id, food: matched },
        },
      };
    }
  }

  // ------------------------------------------------------------------
  // 2. EDIT / SWAP MEAL: "Change my lunch chicken from 150g to 200g" / "Replace rice in dinner with 2 rotis"
  // ------------------------------------------------------------------
  if (
    (/\b(change|update|edit|modify)\b/.test(q) && /\b(from|to)\b/.test(q) && !q.includes('bench') && !q.includes('weight target')) ||
    (/\breplace\b/.test(q) && /\bwith\b/.test(q) && /\b(breakfast|lunch|dinner|snack|rice|roti|dal|chicken|paneer|egg|curd|meal)\b/.test(q))
  ) {
    const todayFoods = await db.foodLogs.where('date').equals(todayKey).toArray();
    const slotHint = /\b(breakfast|lunch|dinner|snacks?)\b/.exec(q)?.[1];
    const slotFiltered = slotHint
      ? todayFoods.filter((f) => f.mealSlot.startsWith(slotHint.slice(0, 5)))
      : todayFoods;

    // Pattern A: "Replace X in dinner with Y"
    const replaceMatch = text.match(/replace\s+(.+?)\s+(?:in\s+(?:breakfast|lunch|dinner|snacks?)\s+)?with\s+(.+)/i);
    if (replaceMatch) {
      const targetPhrase = replaceMatch[1].toLowerCase().trim();
      const replacementPhrase = replaceMatch[2].trim();
      const existing = slotFiltered.find((f) =>
        targetPhrase.split(/\s+/).some((w) => w.length > 2 && f.name.toLowerCase().includes(w))
      );
      if (existing) {
        const parsedRep = await parseFoodPhrase(replacementPhrase);
        if (parsedRep.items.length > 0) {
          const rep = parsedRep.items[0];
          const updated: FoodLogEntry = {
            ...existing,
            name: rep.name,
            servingSize: rep.servingSize,
            calories: rep.calories,
            protein: rep.protein,
            carbs: rep.carbs,
            fats: rep.fats,
            fiber: rep.fiber ?? 0,
            source: parsedRep.source,
          };
          return {
            handled: true,
            assistantContent: `Ready to replace **${existing.name}** (${existing.calories} kcal) in **${existing.mealSlot}** with **${updated.name}** (${updated.servingSize}, ${updated.calories} kcal, ${updated.protein}g P).`,
            contextUsed: ['Nutrition today'],
            providerUsed: 'ApexFit Action Engine',
            proposedAction: {
              type: 'edit_meal',
              label: `Replace with ${updated.name} (${updated.calories} kcal)`,
              requiresConfirmation: true,
              payload: { updated },
            },
          };
        }
      }
    }

    // Pattern B: "Change my lunch chicken from 150g to 200g"
    const scaleMatch = text.match(/from\s+(\d+(?:\.\d+)?)\s*(g|gm|grams?|rotis?|eggs?|bowls?|cups?)?\s+to\s+(\d+(?:\.\d+)?)\s*(g|gm|grams?|rotis?|eggs?|bowls?|cups?)?/i);
    const toOnlyMatch = text.match(/to\s+(\d+(?:\.\d+)?)\s*(g|gm|grams?|rotis?|eggs?|bowls?|cups?)/i);
    const existing = slotFiltered.find((f) =>
      q
        .replace(/\b(change|update|edit|my|lunch|dinner|breakfast|snacks?|from|to|\d+g?)\b/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .some((w) => f.name.toLowerCase().includes(w))
    );

    if (existing && (scaleMatch || toOnlyMatch)) {
      const fromVal = scaleMatch
        ? parseFloat(scaleMatch[1])
        : parseFloat(existing.servingSize.match(/(\d+(?:\.\d+)?)/)?.[1] ?? '1') || 1;
      const toVal = scaleMatch ? parseFloat(scaleMatch[3]) : parseFloat(toOnlyMatch![1]);
      const ratio = Math.max(0.1, toVal / Math.max(0.1, fromVal));
      const unitTxt = (scaleMatch?.[4] ?? toOnlyMatch?.[2] ?? '').trim();

      const updated: FoodLogEntry = {
        ...existing,
        servingSize: unitTxt ? `${toVal}${unitTxt}` : `${toVal}×`,
        calories: Math.round(existing.calories * ratio),
        protein: Math.round(existing.protein * ratio * 10) / 10,
        carbs: Math.round(existing.carbs * ratio * 10) / 10,
        fats: Math.round(existing.fats * ratio * 10) / 10,
        fiber: Math.round((existing.fiber ?? 0) * ratio * 10) / 10,
      };

      return {
        handled: true,
        assistantContent: `Ready to update **${existing.name}** (${existing.mealSlot}) from **${existing.servingSize}** (${existing.calories} kcal, ${existing.protein}g P) → **${updated.servingSize}** (${updated.calories} kcal, ${updated.protein}g P).`,
        contextUsed: ['Nutrition today'],
        providerUsed: 'ApexFit Action Engine',
        proposedAction: {
          type: 'edit_meal',
          label: `Update to ${updated.servingSize} (${updated.calories} kcal)`,
          requiresConfirmation: true,
          payload: { updated },
        },
      };
    }
  }

  // ------------------------------------------------------------------
  // 3. SWAP EXERCISE IN ROUTINE: "Swap Barbell Row for Lat Pulldown in my Pull routine"
  // ------------------------------------------------------------------
  if (/\b(swap|replace)\b/.test(q) && /\b(for|with)\b/.test(q) && (q.includes('routine') || q.includes('program') || q.includes('workout'))) {
    const swapMatch = text.match(/(?:swap|replace)\s+(.+?)\s+(?:for|with)\s+(.+?)(?:\s+in\s+(?:my\s+)?(.+?)(?:\s+routine|\s+program)?)?$/i);
    if (swapMatch) {
      const [exercises, routines] = await Promise.all([
        db.exercises.toArray(),
        db.routines.toArray(),
      ]);
      const fromEx = findBestExerciseMatch(swapMatch[1], exercises);
      const toEx = findBestExerciseMatch(swapMatch[2], exercises);
      const routineHint = (swapMatch[3] ?? '').toLowerCase();

      const targetRoutine =
        (routineHint
          ? routines.find(
              (r) =>
                r.name.toLowerCase().includes(routineHint) ||
                r.dayLabel.toLowerCase().includes(routineHint)
            )
          : undefined) ??
        (fromEx
          ? routines.find((r) => r.items.some((i) => i.exerciseId === fromEx.id))
          : undefined);

      if (fromEx && toEx && targetRoutine) {
        return {
          handled: true,
          assistantContent: `Ready to swap **${fromEx.name}** → **${toEx.name}** in **${targetRoutine.name}**. Confirm below to update the routine.`,
          contextUsed: ['Training program'],
          providerUsed: 'ApexFit Action Engine',
          proposedAction: {
            type: 'swap_exercise',
            label: `Swap ${fromEx.name} → ${toEx.name}`,
            requiresConfirmation: true,
            payload: {
              routineId: targetRoutine.id,
              fromExerciseId: fromEx.id,
              toExerciseId: toEx.id,
            },
          },
        };
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. UPDATE TARGET WEIGHT / PROGRESSION OR ADD EXERCISE TO TODAY'S WORKOUT
  // ------------------------------------------------------------------
  if (/\b(increase|add)\b/.test(q) && /\b(sets?|target weight|kg|lb)\b/.test(q) && /\b(to today|routine|workout|bench|squat|row|press|raise|curl)\b/.test(q) && !q.includes('log ')) {
    const exercises = await db.exercises.toArray();
    const matchedEx = findBestExerciseMatch(
      q.replace(/\b(add|increase|sets?|of|to|today'?s|workout|routine|target|weight|by|[\d.]+\s*kg)\b/g, ' '),
      exercises
    );

    if (matchedEx && q.includes('add') && q.includes('set')) {
      const setsCount = Math.min(8, Math.max(1, parseInt(q.match(/(\d+)\s*sets?/i)?.[1] ?? '3', 10)));
      if (bridge?.activeDraft) {
        const prevDraft = bridge.activeDraft;
        const newBlock = {
          exerciseId: matchedEx.id,
          exerciseName: matchedEx.name,
          muscleGroup: matchedEx.muscleGroup,
          restSeconds: 60,
          sets: Array.from({ length: setsCount }, (_, idx) => ({
            id: `set-ai-${Date.now()}-${idx}`,
            weightKg: null,
            reps: null,
            rpe: null,
            setType: 'working' as const,
            completed: false,
          })),
        };
        const updatedDraft: ActiveWorkoutDraft = {
          ...prevDraft,
          exercises: [...prevDraft.exercises, newBlock],
        };
        bridge.onUpdateDraft(updatedDraft);
        return {
          handled: true,
          assistantContent: `Added **${setsCount} sets of ${matchedEx.name}** to your active workout.`,
          contextUsed: ['Active workout'],
          providerUsed: 'ApexFit Action Engine',
          immediateToast: {
            message: `Added ${setsCount} sets of ${matchedEx.name}`,
            undo: async () => {
              bridge.onUpdateDraft(prevDraft);
            },
          },
        };
      }

      // Otherwise propose adding to today's/next routine
      const routines = await db.routines.toArray();
      const weekday = new Date().getDay();
      const targetRoutine =
        routines.find((r) => r.scheduledWeekdays?.includes(weekday)) ?? routines[0];
      if (targetRoutine) {
        return {
          handled: true,
          assistantContent: `Ready to add **${setsCount} sets of ${matchedEx.name}** to **${targetRoutine.name}**.`,
          contextUsed: ['Training program'],
          providerUsed: 'ApexFit Action Engine',
          proposedAction: {
            type: 'modify_routine',
            label: `Add ${setsCount}× ${matchedEx.name} to ${targetRoutine.dayLabel}`,
            requiresConfirmation: true,
            payload: {
              routineId: targetRoutine.id,
              exerciseId: matchedEx.id,
              defaultSets: setsCount,
            },
          },
        };
      }
    }

    if (matchedEx && q.includes('increase') && /\d+(?:\.\d+)?\s*(?:kg|lb)/.test(q)) {
      const deltaMatch = q.match(/(\d+(?:\.\d+)?)\s*(kg|lb)/);
      const delta = deltaMatch ? parseFloat(deltaMatch[1]) : 2.5;
      return {
        handled: true,
        assistantContent: `Ready to save a **+${delta}${deltaMatch?.[2] ?? 'kg'}** target progression cue for **${matchedEx.name}** in its training notes & AI memory.`,
        contextUsed: ['Exercise library'],
        providerUsed: 'ApexFit Action Engine',
        proposedAction: {
          type: 'update_routine_target',
          label: `Set +${delta}${deltaMatch?.[2] ?? 'kg'} target on ${matchedEx.name}`,
          requiresConfirmation: true,
          payload: {
            exerciseId: matchedEx.id,
            exerciseName: matchedEx.name,
            deltaText: `+${delta}${deltaMatch?.[2] ?? 'kg'} target progression`,
          },
        },
      };
    }
  }

  // ------------------------------------------------------------------
  // 5. LOG WORKOUT SETS: "Log 3 sets of Bench Press: 60kg x 10, 65kg x 8, 70kg x 6"
  // ------------------------------------------------------------------
  if (/^(log|record|add|save)\b/.test(q) && (/[x×*]\s*\d+/.test(q) || /\bsets?\b/.test(q))) {
    const parsedSets = parseSetsFromText(text);
    const exercises = await db.exercises.toArray();
    const exercisePart = text
      .replace(/^(log|record|add|save)\s+/i, '')
      .replace(/\d+\s*sets?\s*(?:of\s*)?/i, '')
      .split(/[:-]/)[0]
      .replace(/\d+(?:\.\d+)?\s*(?:kg|kgs|lb|lbs)?\s*[x×*]\s*\d+.*/i, '')
      .trim();
    const matchedEx = findBestExerciseMatch(exercisePart || text, exercises);

    if (matchedEx && parsedSets.length > 0) {
      const setLogs: WorkoutSetLog[] = parsedSets.map((s, idx) => ({
        id: `set-ai-${Date.now()}-${idx}`,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: 8,
        setType: 'working',
        completed: true,
      }));

      // If active workout exists, append sets directly to it
      if (bridge?.activeDraft) {
        const prevDraft = bridge.activeDraft;
        const existingIdx = prevDraft.exercises.findIndex((e) => e.exerciseId === matchedEx.id);
        const nextExercises =
          existingIdx >= 0
            ? prevDraft.exercises.map((e, i) =>
                i === existingIdx ? { ...e, sets: [...e.sets, ...setLogs] } : e
              )
            : [
                ...prevDraft.exercises,
                {
                  exerciseId: matchedEx.id,
                  exerciseName: matchedEx.name,
                  muscleGroup: matchedEx.muscleGroup,
                  restSeconds: 90,
                  sets: setLogs,
                },
              ];
        bridge.onUpdateDraft({ ...prevDraft, exercises: nextExercises });
        return {
          handled: true,
          assistantContent: `Logged **${setLogs.length} sets of ${matchedEx.name}** (${setLogs.map((s) => `${s.weightKg}kg×${s.reps}`).join(', ')}) into your active workout.`,
          contextUsed: ['Active workout'],
          providerUsed: 'ApexFit Action Engine',
          immediateToast: {
            message: `Logged ${setLogs.length} sets of ${matchedEx.name}`,
            undo: async () => {
              bridge.onUpdateDraft(prevDraft);
            },
          },
        };
      }

      // Otherwise save a completed WorkoutSession in Dexie
      const pastSessions = await db.workoutSessions.toArray();
      const nowIso = new Date().toISOString();
      const exercisesBlock = [
        {
          exerciseId: matchedEx.id,
          exerciseName: matchedEx.name,
          muscleGroup: matchedEx.muscleGroup,
          restSeconds: 90,
          sets: setLogs,
        },
      ];
      const rawSession: WorkoutSession = {
        id: `sess-ai-${Date.now()}`,
        routineName: `AI Quick Log • ${matchedEx.name}`,
        startedAt: nowIso,
        endedAt: nowIso,
        durationSeconds: setLogs.length * 180,
        totalVolumeKg: calculateSessionVolume({ exercises: exercisesBlock }),
        exercises: exercisesBlock,
      };
      const stamped = stampPersonalRecords(rawSession, pastSessions);
      await db.workoutSessions.put(stamped);
      await enqueueSyncMutation('workoutSession', stamped.id, 'upsert', stamped);

      return {
        handled: true,
        assistantContent: `Logged **${setLogs.length} sets of ${matchedEx.name}** (${setLogs.map((s) => `${s.weightKg}kg×${s.reps}`).join(', ')}) • **${stamped.totalVolumeKg} kg** volume saved to Workout History.`,
        contextUsed: ['Workout history'],
        providerUsed: 'ApexFit Action Engine',
        immediateToast: {
          message: `Logged ${setLogs.length}× ${matchedEx.name} (${stamped.totalVolumeKg} kg)`,
          undo: async () => {
            await db.workoutSessions.delete(stamped.id);
            await enqueueSyncMutation('workoutSession', stamped.id, 'delete');
          },
        },
      };
    }
  }

  // ------------------------------------------------------------------
  // 6. LOG MEAL: "Log 2 rotis, 1 bowl masoor dal, and 150g chicken kosha for lunch"
  // ------------------------------------------------------------------
  if (/^(log|add|i ate|ate|track)\b/.test(q)) {
    const slot = detectMealSlot(text);
    const cleanedPhrase = text
      .replace(/^(log|add|i ate|ate|track)\s+/i, '')
      .replace(/\s+(?:for|in|at)\s+(?:breakfast|lunch|dinner|snacks?|pre-workout|post-workout)\s*$/i, '')
      .trim();

    const parsed = await parseFoodPhrase(cleanedPhrase);
    if (parsed.items.length > 0) {
      const nowIso = new Date().toISOString();
      const entries: FoodLogEntry[] = parsed.items.map((item, idx) => ({
        id: `food-ai-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        date: todayKey,
        mealSlot: slot,
        name: item.name,
        servingSize: item.servingSize,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fats: item.fats,
        fiber: item.fiber ?? 0,
        source: parsed.source,
        createdAt: nowIso,
      }));

      await db.foodLogs.bulkAdd(entries);
      for (const e of entries) {
        await enqueueSyncMutation('foodLog', e.id, 'upsert', e);
      }

      const totalCal = entries.reduce((s, e) => s + e.calories, 0);
      const totalProt = Math.round(entries.reduce((s, e) => s + e.protein, 0) * 10) / 10;
      const insertedIds = entries.map((e) => e.id);

      return {
        handled: true,
        assistantContent:
          `Logged **${entries.length} item(s)** to **${slot}** (**${totalCal} kcal**, **${totalProt}g protein**):\n` +
          entries.map((e) => `• **${e.name}** (${e.servingSize}) — ${e.calories} kcal, P ${e.protein}g`).join('\n'),
        contextUsed: ['Nutrition today'],
        providerUsed: parsed.source === 'ai' ? 'Gemini Food Action' : 'Offline Food Action',
        immediateToast: {
          message: `Logged ${entries.length} item(s) to ${slot} (${totalCal} kcal)`,
          undo: async () => {
            await db.foodLogs.bulkDelete(insertedIds);
            for (const id of insertedIds) {
              await enqueueSyncMutation('foodLog', id, 'delete');
            }
          },
        },
      };
    }
  }

  return null;
}

/**
 * Executes a confirmed destructive/overwrite CoachProposedAction in Dexie.
 */
export async function executeConfirmedMutation(
  action: CoachProposedAction
): Promise<{ message: string }> {
  if (action.type === 'create_routine') {
    const routine = action.payload as Routine;
    await db.routines.put(routine);
    await enqueueSyncMutation('routine', routine.id, 'upsert', routine);
    return { message: `Added "${routine.name}" to Programs` };
  }

  if (action.type === 'delete_meal') {
    const { foodId, food } = action.payload as { foodId: string; food: FoodLogEntry };
    await db.foodLogs.delete(foodId);
    await enqueueSyncMutation('foodLog', foodId, 'delete');
    return { message: `Deleted "${food.name}" from ${food.mealSlot}` };
  }

  if (action.type === 'edit_meal') {
    const { updated } = action.payload as { updated: FoodLogEntry };
    await db.foodLogs.put(updated);
    await enqueueSyncMutation('foodLog', updated.id, 'upsert', updated);
    return { message: `Updated "${updated.name}" (${updated.calories} kcal)` };
  }

  if (action.type === 'swap_exercise') {
    const { routineId, fromExerciseId, toExerciseId } = action.payload as {
      routineId: string;
      fromExerciseId: string;
      toExerciseId: string;
    };
    const routine = await db.routines.get(routineId);
    if (!routine) throw new Error('Routine not found');
    const nextRoutine: Routine = {
      ...routine,
      items: routine.items.map((it) =>
        it.exerciseId === fromExerciseId ? { ...it, exerciseId: toExerciseId } : it
      ),
    };
    await db.routines.put(nextRoutine);
    await enqueueSyncMutation('routine', nextRoutine.id, 'upsert', nextRoutine);
    return { message: `Updated "${routine.name}"` };
  }

  if (action.type === 'modify_routine') {
    const { routineId, exerciseId, defaultSets } = action.payload as {
      routineId: string;
      exerciseId: string;
      defaultSets: number;
    };
    const routine = await db.routines.get(routineId);
    if (!routine) throw new Error('Routine not found');
    const nextRoutine: Routine = {
      ...routine,
      items: [...routine.items, { exerciseId, defaultSets, restSeconds: 60 }],
    };
    await db.routines.put(nextRoutine);
    await enqueueSyncMutation('routine', nextRoutine.id, 'upsert', nextRoutine);
    return { message: `Added exercise to "${routine.name}"` };
  }

  if (action.type === 'update_routine_target') {
    const { exerciseId, exerciseName, deltaText } = action.payload as {
      exerciseId: string;
      exerciseName: string;
      deltaText: string;
    };
    const ex = await db.exercises.get(exerciseId);
    if (ex) {
      const nextNotes = ex.notes ? `${ex.notes} | ${deltaText}` : deltaText;
      await db.exercises.update(exerciseId, { notes: nextNotes });
      await enqueueSyncMutation('exercise', exerciseId, 'upsert', { ...ex, notes: nextNotes });
    }
    return { message: `Saved ${deltaText} for ${exerciseName}` };
  }

  return { message: 'Action applied' };
}
