import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { displayWeight, weightLabel } from '../units';
import {
  detectAndHandleMutationCommand,
  type ActiveWorkoutBridge,
} from './actionExecutor';
import { extractAndStoreMemoryFromMessage, syncBaselineMemories } from './memoryService';
import { retrieveRelevantContext } from './contextRetriever';
import {
  AIProviderError,
  getOrCreateSessionToken,
  invokeServerLLMProvider,
} from './providers';
import { buildCoachSystemPrompt } from './systemPrompts';
import {
  generateWorkoutTool,
  suggestExerciseSubstitutions,
  type ToolAuthContext,
} from './tools';
import { generateWeeklyFitnessAnalystReport } from './weeklyAnalyst';
import type { AIProviderId, CoachMode, CoachProposedAction } from '../../types';

export interface OrchestratedCoachReply {
  content: string;
  contextUsed: string[];
  providerUsed: string;
  proposedAction?: CoachProposedAction;
  immediateToast?: {
    message: string;
    undo: () => Promise<void>;
  };
  errorNote?: string;
}

interface WorkoutPerfSnapshot {
  name: string;
  sessions: Array<{ date: string; topWeightKg: number; topReps: number; best1RM: number; setsSummary: string }>;
}

async function buildIntelligentOfflineReply(
  auth: ToolAuthContext,
  mode: CoachMode,
  userPrompt: string,
  data: Record<string, unknown>
): Promise<{ content: string; proposedAction?: CoachProposedAction }> {
  const q = userPrompt.toLowerCase();
  const profile = await db.profile.get(DEFAULT_PROFILE_ID);
  const unit = profile?.unitSystem ?? 'metric';
  const wUnit = weightLabel(unit);

  // 1. Weekly Fitness Analyst report
  if (q.includes('weekly report') || q.includes('weekly progress') || q.includes('weekly fitness') || q.includes('why am i not progressing')) {
    const report = await generateWeeklyFitnessAnalystReport(auth);
    return { content: report };
  }

  // 2. Workout Generation (requires user confirmation before saving)
  if (q.includes('generate') || q.includes('build a workout') || q.includes('next week') || q.includes('create workout')) {
    const focus = q.includes('pull') || q.includes('back')
      ? 'pull'
      : q.includes('leg') || q.includes('lower')
        ? 'legs'
        : q.includes('push') || q.includes('chest')
          ? 'push'
          : q.includes('full')
            ? 'full_body'
            : 'upper';
    const routine = await generateWorkoutTool(auth, focus);
    const exRows = await db.exercises.toArray();
    const exMap = new Map(exRows.map((e) => [e.id, e]));
    const listText = routine.items
      .map(
        (it, idx) =>
          `${idx + 1}. **${exMap.get(it.exerciseId)?.name ?? it.exerciseId}** — ${it.defaultSets} × 8–12 (Rest ${it.restSeconds}s, RPE 8)`
      )
      .join('\n');

    return {
      content: `### Generated ${routine.dayLabel} Program\n\nTailored to your saved equipment and recent training volume:\n\n${listText}\n\nTap below to review and add this program to **Workouts**.`,
      proposedAction: {
        type: 'create_routine',
        label: `Add "${routine.name}" to Programs`,
        payload: routine,
      },
    };
  }

  // 3. Exercise Substitution
  if (q.includes('substit') || q.includes('replace') || q.includes('alternative') || q.includes('occupied') || q.includes('unavailable')) {
    const targetMatch = q.match(/\b(bench|squat|pulldown|row|press|curl|pushdown|rdl|lateral)\b/)?.[1] ?? 'bench';
    const sub = await suggestExerciseSubstitutions(auth, targetMatch, profile?.equipmentAvailable);
    if (sub.found && sub.alternatives.length > 0) {
      return {
        content: `**Best Substitutions for ${sub.original} (${sub.muscleGroup}):**\n` +
          sub.alternatives
            .map((a) => `• **${a.name}** (${a.equipment} • ${a.category ?? 'Exercise'} • ${a.difficulty ?? 'All levels'})`)
            .join('\n'),
      };
    }
  }

  // 4. Nutrition Coaching (actual calories, protein, remaining, Indian/Bengali/budget)
  if (
    mode === 'nutrition' ||
    /\b(eat|protein|calorie|macro|dinner|lunch|breakfast|chicken|egg|cheap|budget|bengali|indian|cook)\b/.test(
      q
    )
  ) {
    const todayNut = data.todayNutrition as {
      totals: { calories: number; protein: number; carbs: number; fats: number; fiber: number };
    } | undefined;
    const targets = data.nutritionTargets as {
      calorieTarget: number;
      proteinTarget: number;
    } | undefined;
    const avg7 = data.nutrition7dAvg as {
      avgCalories: number;
      avgProteinG: number;
      loggedDays: number;
    } | undefined;

    const eatenCal = Math.round(todayNut?.totals.calories ?? 0);
    const eatenProt = Math.round(todayNut?.totals.protein ?? 0);
    const targetCal = targets?.calorieTarget ?? 2400;
    const targetProt = targets?.proteinTarget ?? 150;
    const remCal = Math.round(targetCal - eatenCal);
    const remProt = Math.max(0, Math.round(targetProt - eatenProt));

    const ideas: string[] = [];
    if (q.includes('cheap') || q.includes('budget')) {
      ideas.push(
        `• **Soya Chunks + Boiled Eggs (Estimated):** 50g dry soya chunks (~26g P, 172 kcal) + 3 whole boiled eggs (~19g P, 216 kcal) = **~45g protein, ~388 kcal** (lowest cost per gram).`,
        `• **Bengali Masoor Dal + Egg Whites:** 1 bowl Masoor Dal (~11.5g P, 175 kcal) + 4 egg whites (~14.4g P, 68 kcal) = **~26g protein, ~243 kcal**.`
      );
    } else if (q.includes('egg') && q.includes('chicken')) {
      ideas.push(
        `• **High-Protein Chicken & Egg Skillet (Estimated):** 150g grilled/pan-seared chicken breast (~46.5g P, 248 kcal) + 2 whole eggs (~12.6g P, 144 kcal) + mixed greens = **~59g protein, ~420 kcal**.`
      );
    } else if (remProt > 25) {
      ideas.push(
        `• **Bengali Home Option (Estimated):** 1 bowl Rohu Machher Jhol (~24g P, 245 kcal) + 1 cup Tok Doi (~5.5g P, 98 kcal) + 1 cup steamed Bhat (~4.3g P, 205 kcal) = **~34g protein, ~548 kcal**.`,
        `• **Quick Gym Option (Estimated):** 150g Grilled Chicken Breast (~46.5g P, 248 kcal) or 150g Paneer (~27g P, 398 kcal) + 1 scoop Whey (~25g P, 122 kcal).`
      );
    } else {
      ideas.push(
        `• You only need **${remProt}g protein** — 1 cup Greek yogurt (~15g P, 105 kcal) or 2 boiled eggs (~12.6g P, 144 kcal) finishes your target cleanly.`
      );
    }

    return {
      content:
        `**Verified Nutrition Today:** **${eatenCal.toLocaleString()} / ${targetCal.toLocaleString()} kcal** • **${eatenProt} / ${targetProt}g protein**\n` +
        `• Remaining: **${remCal} kcal** and **${remProt}g protein**\n` +
        (avg7 ? `• 7d Average (${avg7.loggedDays}/7 days): **${avg7.avgCalories} kcal**, **${avg7.avgProteinG}g protein/day**\n\n` : '\n') +
        `**Practical Meal Recommendations (Estimates):**\n${ideas.join('\n')}`,
    };
  }

  // 5. Recovery & Readiness Reasoning
  if (
    mode === 'recovery' ||
    /\b(sleep|rest|deload|fatigue|sore|recover|should i train)\b/.test(q)
  ) {
    const rec = data.recoverySummary as {
      score: number;
      status: string;
      recommendation: string;
      sleepHours: number | null;
      steps: number | null;
      waterMl: number;
    } | undefined;

    if (!rec) {
      return {
        content:
          'Insufficient recovery logs stored yet. Log today’s sleep hours, soreness, and steps in the **Recovery** tab so I can tailor your training load accurately.',
      };
    }

    return {
      content:
        `**Recovery Readiness (Calculated Estimate from Verified Logs):** **${rec.score}/100 (${rec.status})**\n` +
        `• Latest Sleep: **${rec.sleepHours ?? 'Not logged'} hrs** | Steps: **${rec.steps?.toLocaleString() ?? 'Not logged'}** | Water Today: **${rec.waterMl} ml**\n\n` +
        `**Recommendation:** ${rec.recommendation}\n\n` +
        `*Note: Readiness is a practical training guide, not a medical metric. If you experience sharp joint pain or persistent symptoms, rest and consult a healthcare professional.*`,
    };
  }

  // 6. Workout Analysis & Progressive Overload (Double Progression)
  const perf = (data.exercisePerformance as WorkoutPerfSnapshot[] | undefined) ?? [];
  const stats = data.workoutStats as {
    totalWorkouts: number;
    currentStreak: number;
    sessionsThisWeek: number;
    weeklyVolumeKg: number;
    weeklySetsByMuscle: Record<string, number>;
    undertrainedMuscles: string[];
  } | undefined;
  const todayW = data.todayWorkout as {
    completedToday: { routineName: string } | null;
    recommended: { name: string; dayLabel: string } | null;
  } | undefined;

  if (q.includes('today') && todayW) {
    if (todayW.completedToday) {
      return {
        content: `You already completed **${todayW.completedToday.routineName}** today. Focus on hitting your protein target, hydration, and 7.5+ hrs of sleep for recovery.`,
      };
    }
    if (todayW.recommended) {
      return {
        content: `**Today's Recommendation:** Train **${todayW.recommended.name}** (${todayW.recommended.dayLabel}).\n\nIt is next in your split rotation (${stats?.sessionsThisWeek ?? 0} sessions logged in the last 7 days). Aim to add +1 rep or +${unit === 'imperial' ? '5 lb' : '2.5 kg'} on your first compound lift with clean technique.`,
      };
    }
  }

  const progressionLines = perf.slice(0, 4).map((p) => {
    const latest = p.sessions[0];
    const prev = p.sessions[1];
    const improved = prev ? latest.best1RM >= prev.best1RM : false;
    const step = unit === 'imperial' ? '5 lb' : '2.5 kg';
    const advice =
      latest.topReps >= 10 || improved
        ? `Increase load by +${step} next session (double progression ready)`
        : `Keep ${displayWeight(latest.topWeightKg, unit, 1)} ${wUnit} and push +1 rep per set before increasing weight`;
    return `• **${p.name}** (${latest.setsSummary}): *${advice}*`;
  });

  return {
    content:
      `**Verified Training Analysis (${stats?.totalWorkouts ?? 0} sessions):**\n` +
      `• Weekly Consistency: **${stats?.sessionsThisWeek ?? 0} workouts** (${stats?.currentStreak ?? 0} streak) • **${displayWeight(stats?.weeklyVolumeKg ?? 0, unit, 0).toLocaleString()} ${wUnit}** volume\n` +
      (stats?.undertrainedMuscles?.length
        ? `• Undertrained (<6 weekly sets): **${stats.undertrainedMuscles.join(', ')}**\n\n`
        : '\n') +
      `**Progressive Overload Guidance:**\n` +
      (progressionLines.join('\n') || '• Log working sets in a workout to receive lift-by-lift progression targets.'),
  };
}

export async function runCoachTurn(params: {
  conversationId: string;
  mode: CoachMode;
  userPrompt: string;
  workoutBridge?: ActiveWorkoutBridge;
  onTokenChunk?: (partialText: string) => void;
}): Promise<OrchestratedCoachReply> {
  const sessionToken = getOrCreateSessionToken();
  const auth: ToolAuthContext = { sessionToken, profileId: DEFAULT_PROFILE_ID };

  // 1. Sync verified baseline memories & extract any new user-stated memory
  await syncBaselineMemories();
  await extractAndStoreMemoryFromMessage(params.userPrompt);

  // 2. Check if prompt is a direct Dexie read/write action command (meals or workouts)
  const actionOutcome = await detectAndHandleMutationCommand(
    params.userPrompt,
    params.workoutBridge
  );
  if (actionOutcome?.handled) {
    if (params.onTokenChunk && actionOutcome.assistantContent) {
      params.onTokenChunk(actionOutcome.assistantContent);
    }
    return {
      content: actionOutcome.assistantContent,
      contextUsed: actionOutcome.contextUsed,
      providerUsed: actionOutcome.providerUsed,
      proposedAction: actionOutcome.proposedAction,
      immediateToast: actionOutcome.immediateToast,
    };
  }

  // 3. Selective context retrieval based on question & mode
  const retrieved = await retrieveRelevantContext(auth, params.mode, params.userPrompt);
  const profile = await db.profile.get(DEFAULT_PROFILE_ID);
  const preferredProvider: AIProviderId = profile?.aiProvider ?? 'gemini';

  // 3. Load recent turns in this conversation for coherent multi-turn context
  const historyRows = await db.coachMessages
    .where('conversationId')
    .equals(params.conversationId)
    .sortBy('createdAt');
  const recentTurns = historyRows.slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let finalContent = '';
  let providerUsed = 'Local Coach Engine';
  let proposedAction: CoachProposedAction | undefined;
  let errorNote: string | undefined;

  const isActionRequest =
    params.userPrompt.toLowerCase().includes('generate') ||
    params.userPrompt.toLowerCase().includes('weekly report');

  if (preferredProvider !== 'local' && !isActionRequest) {
    try {
      const llmRes = await invokeServerLLMProvider({
        provider: preferredProvider,
        model: profile?.aiModel,
        systemPrompt: buildCoachSystemPrompt(params.mode),
        contextJson: JSON.stringify(retrieved.data),
        messages: recentTurns,
        sessionToken,
      });
      finalContent = llmRes.content;
      providerUsed = `${llmRes.providerUsed.toUpperCase()} (${llmRes.modelUsed})`;
    } catch (err) {
      if (err instanceof AIProviderError) {
        if (err.code === 'OFFLINE') {
          errorNote = 'Offline mode: answered using local on-device coaching intelligence.';
        } else if (err.code === 'PROVIDER_NOT_CONFIGURED') {
          errorNote = 'Server LLM key not configured: answered using local coaching engine.';
        } else {
          errorNote = `${err.message} Fallback to local coaching engine.`;
        }
      } else {
        errorNote = 'Cloud LLM unavailable; answered using local coaching engine.';
      }
      const local = await buildIntelligentOfflineReply(
        auth,
        params.mode,
        params.userPrompt,
        retrieved.data
      );
      finalContent = local.content;
      proposedAction = local.proposedAction;
      providerUsed = 'Local Coach (Fallback)';
    }
  } else {
    const local = await buildIntelligentOfflineReply(
      auth,
      params.mode,
      params.userPrompt,
      retrieved.data
    );
    finalContent = local.content;
    proposedAction = local.proposedAction;
    providerUsed = 'Local Coach Engine';
  }

  // Progressive streaming reveal in UI
  if (params.onTokenChunk && finalContent) {
    const words = finalContent.split(' ');
    const step = Math.max(4, Math.ceil(words.length / 12));
    for (let i = step; i < words.length; i += step) {
      params.onTokenChunk(words.slice(0, i).join(' '));
      await new Promise((r) => setTimeout(r, 18));
    }
    params.onTokenChunk(finalContent);
  }

  return {
    content: finalContent,
    contextUsed: retrieved.contextTags,
    providerUsed,
    proposedAction,
    errorNote,
  };
}
