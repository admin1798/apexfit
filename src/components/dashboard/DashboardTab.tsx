import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bot,
  CheckCircle2,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { GOAL_CONFIG } from '../../services/nutritionCalc';
import { calculateRecoverySummary } from '../../services/recoveryCalc';
import { enqueueSyncMutation } from '../../services/syncService';
import { displayWeight, inputToKg, weightLabel } from '../../services/units';
import { calculateWorkoutStreak, offsetDateKey, toLocalDateKey } from '../../services/workoutMetrics';
import type { DashboardWidgetId, Routine } from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Badge, Button, Card, ProgressBar } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

interface DashboardTabProps {
  onStartRoutine: (routine: Routine) => void;
  onGoToNutrition: () => void;
  onGoToProgress: () => void;
  onGoToRecovery: () => void;
  onGoToCoach: () => void;
  hasActiveWorkout: boolean;
  onResumeWorkout: () => void;
}

const ALL_WIDGETS: Array<{ id: DashboardWidgetId; label: string; description: string }> = [
  { id: 'today_workout', label: "Today's Workout & Goal", description: 'Recommended split, completion, streak' },
  { id: 'nutrition_summary', label: 'Calories & Macros', description: 'Daily kcal, protein, carbs, fats & fiber' },
  { id: 'hydration', label: 'Water Intake', description: 'One-tap hydration logger' },
  { id: 'steps_sleep', label: 'Recovery, Steps & Sleep', description: 'Readiness score, sleep hours & daily steps' },
  { id: 'weight_energy', label: 'Body Weight & Energy', description: 'Quick weigh-in & 7d calorie balance' },
  { id: 'weekly_activity', label: 'Weekly Activity Strip', description: '7-day workout completion calendar' },
  { id: 'recent_prs', label: 'Recent Personal Records', description: 'Latest PR lifts from sessions' },
];

function ProgressRing({
  size,
  strokeWidth,
  progress,
  color,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#252B27" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function DashboardTab({
  onStartRoutine,
  onGoToNutrition,
  onGoToProgress,
  onGoToRecovery,
  onGoToCoach,
  hasActiveWorkout,
  onResumeWorkout,
}: DashboardTabProps) {
  const [todayKey] = useState(() => toLocalDateKey(new Date()));
  const [todayWeekday] = useState(() => new Date().getDay());
  const [weightInput, setWeightInput] = useState('');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { showToast } = useToast();

  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const routines = useLiveQuery(() => db.routines.toArray(), [], []);
  const sessions = useLiveQuery(() => db.workoutSessions.toArray(), [], []);
  const todayFoods = useLiveQuery(
    () => db.foodLogs.where('date').equals(todayKey).toArray(),
    [todayKey],
    []
  );
  const allRecentFoods = useLiveQuery(() => db.foodLogs.toArray(), [], []);
  const todayWaters = useLiveQuery(
    () => db.waterLogs.where('date').equals(todayKey).toArray(),
    [todayKey],
    []
  );
  const weightLogs = useLiveQuery(() => db.weightLogs.orderBy('date').toArray(), [], []);
  const recoveryLogs = useLiveQuery(() => db.recoveryLogs.orderBy('date').toArray(), [], []);

  if (!profile) return null;

  const widgets = new Set<DashboardWidgetId>(
    profile.dashboardWidgets?.length ? profile.dashboardWidgets : ALL_WIDGETS.map((w) => w.id)
  );
  const unit = profile.unitSystem ?? 'metric';
  const wUnit = weightLabel(unit);

  const totals = todayFoods.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fats: acc.fats + item.fats,
      fiber: acc.fiber + (item.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );

  const kcalRemaining = profile.calorieTarget - totals.calories;
  const waterMl = todayWaters.reduce((sum, w) => sum + w.amountMl, 0);

  const { currentStreakDays, sessionsThisWeek } = calculateWorkoutStreak(sessions);
  const todayCompletedSession = sessions.find((s) => s.startedAt.slice(0, 10) === todayKey);

  const scheduledToday = routines.find((r) => r.scheduledWeekdays?.includes(todayWeekday));
  const recommendedRoutine =
    scheduledToday ??
    [...routines].sort((a, b) => {
      if (!a.lastPerformedAt && !b.lastPerformedAt) return 0;
      if (!a.lastPerformedAt) return -1;
      if (!b.lastPerformedAt) return 1;
      return a.lastPerformedAt.localeCompare(b.lastPerformedAt);
    })[0] ??
    routines[0];

  const latestWeightKg = weightLogs[weightLogs.length - 1]?.weightKg ?? profile.weightKg;
  const sevenDaysAgoKey = offsetDateKey(todayKey, -7);
  const prev7WeightLogs = weightLogs.filter((w) => w.date <= sevenDaysAgoKey);
  const baselineWeightKg =
    prev7WeightLogs[prev7WeightLogs.length - 1]?.weightKg ?? weightLogs[0]?.weightKg ?? latestWeightKg;
  const weightDelta7dDisplay =
    Math.round((displayWeight(latestWeightKg, unit, 1) - displayWeight(baselineWeightKg, unit, 1)) * 10) / 10;

  const last7Keys = Array.from({ length: 7 }, (_, i) => offsetDateKey(todayKey, -(6 - i)));
  const dailyCals = last7Keys
    .map((k) => allRecentFoods.filter((f) => f.date === k).reduce((s, f) => s + f.calories, 0))
    .filter((c) => c > 0);
  const avgDailyIntake =
    dailyCals.length > 0 ? Math.round(dailyCals.reduce((a, b) => a + b, 0) / dailyCals.length) : 0;
  const avgEnergyBalance = avgDailyIntake > 0 ? avgDailyIntake - profile.calorieTarget : 0;

  const latestRecovery =
    recoveryLogs.find((r) => r.date === todayKey) ?? recoveryLogs[recoveryLogs.length - 1];
  const recoverySummary = calculateRecoverySummary(
    latestRecovery,
    profile.sleepGoalHours ?? 7.5,
    waterMl,
    profile.waterGoalMl,
    sessions.filter((s) => s.startedAt.slice(0, 10) >= sevenDaysAgoKey)
  );

  // Recent PRs
  const recentPRs: Array<{ exerciseName: string; weightKg: number; reps: number; date: string }> = [];
  const sortedSessions = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const s of sortedSessions) {
    for (const ex of s.exercises) {
      for (const st of ex.sets) {
        if (st.completed && (st.isPR1RM || st.isPRWeight)) {
          recentPRs.push({
            exerciseName: ex.exerciseName,
            weightKg: st.weightKg ?? 0,
            reps: st.reps ?? 0,
            date: s.startedAt.slice(5, 10),
          });
          break;
        }
      }
      if (recentPRs.length >= 4) break;
    }
    if (recentPRs.length >= 4) break;
  }

  async function handleAddWater(amountMl: number) {
    const entry = {
      id: `water-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: todayKey,
      amountMl,
      createdAt: new Date().toISOString(),
    };
    await db.waterLogs.add(entry);
    await enqueueSyncMutation('waterLog', entry.id, 'upsert', entry);
    showToast(`Added +${amountMl} ml water`, 'info');
  }

  async function handleUndoLastWater() {
    if (todayWaters.length === 0) return;
    const sorted = [...todayWaters].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    await db.waterLogs.delete(sorted[0].id);
    await enqueueSyncMutation('waterLog', sorted[0].id, 'delete');
    showToast('Removed last water log', 'info');
  }

  async function handleQuickWeightSave(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(weightInput);
    if (!Number.isFinite(val) || val < 25 || val > 500) {
      showToast('Enter a valid body weight', 'warning');
      return;
    }
    const kg = Math.round(inputToKg(val, unit) * 10) / 10;
    const entry = { id: `wt-${todayKey}`, date: todayKey, weightKg: kg };
    await db.weightLogs.put(entry);
    await db.profile.update(DEFAULT_PROFILE_ID, { weightKg: kg });
    await enqueueSyncMutation('weightLog', entry.id, 'upsert', entry);
    setWeightInput('');
    showToast(`Logged ${displayWeight(kg, unit, 1)} ${wUnit}`, 'success');
  }

  async function toggleWidget(id: DashboardWidgetId) {
    const next = new Set(widgets);
    if (next.has(id)) {
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    const arr = Array.from(next);
    await db.profile.update(DEFAULT_PROFILE_ID, { dashboardWidgets: arr });
    await enqueueSyncMutation('profile', DEFAULT_PROFILE_ID, 'upsert', { dashboardWidgets: arr });
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Top Status & Quick Actions Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="lime">{GOAL_CONFIG[profile.goal].label}</Badge>
          <Badge tone={recoverySummary.tone}>
            Recovery {recoverySummary.score}% • {recoverySummary.status}
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => setCustomizeOpen(true)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#303832] bg-[#1D221F] px-3 text-xs font-medium text-[#A1AAA3] hover:text-[#F3F5F2]"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Customize
        </button>
      </div>

      {/* Quick Actions Strip */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() =>
            hasActiveWorkout
              ? onResumeWorkout()
              : recommendedRoutine && onStartRoutine(recommendedRoutine)
          }
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-[#B7F36B]/30 bg-[#B7F36B]/15 px-2 text-xs font-semibold text-[#B7F36B] active:scale-95"
        >
          <Play className="h-3.5 w-3.5 fill-[#B7F36B]" />
          {hasActiveWorkout ? 'Resume' : 'Train'}
        </button>
        <button
          type="button"
          onClick={onGoToNutrition}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-[#303832] bg-[#1D221F] px-2 text-xs font-semibold text-[#F3F5F2] active:scale-95"
        >
          <Plus className="h-3.5 w-3.5 text-[#75D69A]" />
          Log Meal
        </button>
        <button
          type="button"
          onClick={onGoToCoach}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-[#303832] bg-[#1D221F] px-2 text-xs font-semibold text-[#F3F5F2] active:scale-95"
        >
          <Bot className="h-3.5 w-3.5 text-[#79B8F5]" />
          AI Coach
        </button>
      </div>

      {/* Resume Active Workout Banner */}
      {hasActiveWorkout && (
        <button
          type="button"
          onClick={onResumeWorkout}
          className="flex min-h-[54px] w-full items-center justify-between rounded-2xl border border-[#B7F36B]/40 bg-[#B7F36B]/15 px-4 py-3 text-left transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-[#B7F36B]" />
            <div>
              <p className="text-sm font-semibold text-[#B7F36B]">Workout in Progress</p>
              <p className="text-xs text-[#F3F5F2]/80">Tap to return to live sets &amp; rest timer</p>
            </div>
          </div>
          <Play className="h-5 w-5 fill-[#B7F36B] text-[#B7F36B]" />
        </button>
      )}

      {/* Desktop 2-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Widget: Nutrition Summary */}
        {widgets.has('nutrition_summary') && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#F3F5F2]">Daily Nutrition</h2>
                <p className="text-xs text-[#A1AAA3]">
                  Target {profile.calorieTarget.toLocaleString()} kcal • Fiber {Math.round(totals.fiber)}/{profile.fiberTarget ?? 34}g
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={onGoToNutrition}>
                <Plus className="h-3.5 w-3.5 text-[#B7F36B]" />
                Log Food
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <ProgressRing
                size={122}
                strokeWidth={11}
                progress={totals.calories / Math.max(1, profile.calorieTarget)}
                color={kcalRemaining < -120 ? '#EAB765' : '#B7F36B'}
              >
                <span className="tabular-nums text-xl font-bold text-[#F3F5F2]">
                  {Math.abs(Math.round(kcalRemaining))}
                </span>
                <span className="text-[11px] font-medium text-[#A1AAA3]">
                  {kcalRemaining >= 0 ? 'kcal left' : 'kcal over'}
                </span>
                <span className="mt-0.5 tabular-nums text-[10px] text-[#727B74]">
                  {Math.round(totals.calories)} eaten
                </span>
              </ProgressRing>

              <div className="grid flex-1 grid-cols-3 gap-2">
                {[
                  { label: 'Protein', eaten: totals.protein, target: profile.proteinTarget, color: '#B7F36B' },
                  { label: 'Carbs', eaten: totals.carbs, target: profile.carbsTarget, color: '#79B8F5' },
                  { label: 'Fats', eaten: totals.fats, target: profile.fatsTarget, color: '#EAB765' },
                ].map((m) => {
                  const rem = Math.max(0, Math.round(m.target - m.eaten));
                  return (
                    <div key={m.label} className="flex flex-col items-center rounded-2xl bg-[#171A18] px-1 py-2.5">
                      <ProgressRing size={54} strokeWidth={5} progress={m.eaten / Math.max(1, m.target)} color={m.color}>
                        <span className="tabular-nums text-xs font-bold text-[#F3F5F2]">{Math.round(m.eaten)}g</span>
                      </ProgressRing>
                      <span className="mt-1.5 text-[11px] font-semibold text-[#F3F5F2]">{m.label}</span>
                      <span className="tabular-nums text-[10px] text-[#727B74]">{rem}g left</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* Widget: Today's Workout */}
        {widgets.has('today_workout') && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#B7F36B]/15 text-[#B7F36B]">
                  <Dumbbell className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Today&apos;s Training</h2>
                  <p className="text-xs text-[#A1AAA3]">{sessionsThisWeek} sessions in last 7 days</p>
                </div>
              </div>
              <Badge tone="warning">
                <Flame className="h-3.5 w-3.5" />
                {currentStreakDays} streak
              </Badge>
            </div>

            {todayCompletedSession ? (
              <div className="rounded-2xl border border-[#75D69A]/30 bg-[#75D69A]/10 p-3.5">
                <div className="flex items-center gap-2 text-[#75D69A]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Completed Today</span>
                </div>
                <h3 className="mt-1 text-base font-bold text-[#F3F5F2]">{todayCompletedSession.routineName}</h3>
                <p className="mt-0.5 tabular-nums text-xs text-[#A1AAA3]">
                  {displayWeight(todayCompletedSession.totalVolumeKg, unit, 0).toLocaleString()} {wUnit} total volume
                </p>
              </div>
            ) : recommendedRoutine ? (
              <div className="rounded-2xl border border-[#303832] bg-[#171A18] p-3.5">
                <Badge tone="lime">Up Next • {recommendedRoutine.dayLabel}</Badge>
                <h3 className="mt-1.5 truncate text-base font-bold text-[#F3F5F2]">{recommendedRoutine.name}</h3>
                <p className="mt-0.5 text-xs text-[#A1AAA3]">
                  {recommendedRoutine.items.length} exercises •{' '}
                  {recommendedRoutine.items.reduce((s, i) => s + i.defaultSets, 0)} working sets
                </p>
                <Button
                  className="mt-3 w-full"
                  onClick={() => (hasActiveWorkout ? onResumeWorkout() : onStartRoutine(recommendedRoutine))}
                >
                  <Play className="h-4 w-4 fill-[#101211]" />
                  {hasActiveWorkout ? 'Resume Active Workout' : 'Start Workout'}
                </Button>
              </div>
            ) : null}
          </Card>
        )}

        {/* Widget: Hydration */}
        {widgets.has('hydration') && (
          <Card>
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#79B8F5]/15 text-[#79B8F5]">
                  <Droplets className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Hydration</h2>
                  <p className="tabular-nums text-xs text-[#A1AAA3]">
                    {waterMl.toLocaleString()} / {profile.waterGoalMl.toLocaleString()} ml
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleUndoLastWater}
                disabled={todayWaters.length === 0}
                aria-label="Undo last water log"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#A1AAA3] disabled:opacity-30"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
            <ProgressBar value={waterMl} max={profile.waterGoalMl} tone="info" height="md" className="mb-3" />
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => handleAddWater(250)}>
                <Plus className="h-4 w-4 text-[#79B8F5]" />
                250 ml
              </Button>
              <Button variant="secondary" onClick={() => handleAddWater(500)}>
                <Plus className="h-4 w-4 text-[#79B8F5]" />
                500 ml
              </Button>
            </div>
          </Card>
        )}

        {/* Widget: Steps, Sleep & Recovery */}
        {widgets.has('steps_sleep') && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#75D69A]/15 text-[#75D69A]">
                  <HeartPulse className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Recovery &amp; Activity</h2>
                  <p className="text-xs text-[#A1AAA3]">{recoverySummary.recommendation}</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={onGoToRecovery}>
                Update →
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-[#171A18] p-3">
                <div className="flex items-center gap-1.5 text-xs text-[#A1AAA3]">
                  <Footprints className="h-3.5 w-3.5 text-[#B7F36B]" />
                  <span>Steps</span>
                </div>
                <p className="mt-1 tabular-nums text-lg font-bold text-[#F3F5F2]">
                  {(latestRecovery?.steps ?? 0).toLocaleString()}
                </p>
                <ProgressBar
                  value={latestRecovery?.steps ?? 0}
                  max={profile.stepsGoal ?? 8500}
                  tone="lime"
                  className="mt-1.5"
                />
              </div>

              <div className="rounded-2xl bg-[#171A18] p-3">
                <div className="flex items-center gap-1.5 text-xs text-[#A1AAA3]">
                  <Moon className="h-3.5 w-3.5 text-[#79B8F5]" />
                  <span>Sleep</span>
                </div>
                <p className="mt-1 tabular-nums text-lg font-bold text-[#F3F5F2]">
                  {latestRecovery?.sleepHours ?? '—'} <span className="text-xs font-normal text-[#A1AAA3]">hrs</span>
                </p>
                <p className="mt-1 text-[11px] text-[#727B74]">
                  Goal {profile.sleepGoalHours ?? 7.5} hrs • Quality {latestRecovery?.sleepQuality ?? '—'}/5
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Widget: Body Weight & Energy */}
        {widgets.has('weight_energy') && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#B7F36B]/15 text-[#B7F36B]">
                  <Scale className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Body Weight &amp; Energy</h2>
                  <p className="text-xs text-[#A1AAA3]">
                    Goal {displayWeight(profile.goalWeightKg ?? profile.weightKg, unit, 1)} {wUnit}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={onGoToProgress}>
                Progress →
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-[#171A18] p-3">
                <p className="text-[11px] text-[#A1AAA3]">Current Weight</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="tabular-nums text-xl font-bold text-[#F3F5F2]">
                    {displayWeight(latestWeightKg, unit, 1)}
                  </span>
                  <span className="text-xs text-[#A1AAA3]">{wUnit}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-[#A1AAA3]">
                  {weightDelta7dDisplay >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-[#75D69A]" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-[#79B8F5]" />
                  )}
                  <span className="tabular-nums">
                    {weightDelta7dDisplay > 0 ? `+${weightDelta7dDisplay}` : weightDelta7dDisplay} {wUnit} (7d)
                  </span>
                </div>
              </div>

              <div className="rounded-2xl bg-[#171A18] p-3">
                <p className="text-[11px] text-[#A1AAA3]">7d Energy Balance</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="tabular-nums text-xl font-bold text-[#F3F5F2]">
                    {avgEnergyBalance > 0 ? `+${avgEnergyBalance}` : avgEnergyBalance}
                  </span>
                  <span className="text-xs text-[#A1AAA3]">kcal/d</span>
                </div>
                <p className="mt-1 tabular-nums text-[11px] text-[#727B74]">
                  Avg {avgDailyIntake.toLocaleString()} kcal/day
                </p>
              </div>
            </div>

            <form onSubmit={handleQuickWeightSave} className="mt-3 flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder={`Log today's weight (${displayWeight(latestWeightKg, unit, 1)} ${wUnit})`}
                className="min-h-[44px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-3 text-sm text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
              />
              <Button type="submit" variant="secondary">
                Log {wUnit}
              </Button>
            </form>
          </Card>
        )}

        {/* Widget: Weekly Activity Strip & Recent PRs */}
        {(widgets.has('weekly_activity') || widgets.has('recent_prs')) && (
          <Card>
            {widgets.has('weekly_activity') && (
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Weekly Activity</h2>
                  <span className="text-xs text-[#A1AAA3]">{sessionsThisWeek} / {profile.trainingDaysPerWeek ?? 5} target</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {last7Keys.map((k) => {
                    const trained = sessions.some((s) => s.startedAt.slice(0, 10) === k);
                    const dayLabel = new Date(`${k}T00:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });
                    return (
                      <div
                        key={k}
                        className={`flex flex-col items-center justify-center rounded-xl border py-2 text-xs font-semibold ${
                          trained
                            ? 'border-[#B7F36B]/40 bg-[#B7F36B]/15 text-[#B7F36B]'
                            : 'border-[#252B28] bg-[#171A18] text-[#727B74]'
                        }`}
                      >
                        <span>{dayLabel}</span>
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {widgets.has('recent_prs') && (
              <div className={widgets.has('weekly_activity') ? 'mt-4 border-t border-[#252B28] pt-3.5' : ''}>
                <div className="mb-2 flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-[#B7F36B]" />
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Recent Personal Records</h2>
                </div>
                {recentPRs.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentPRs.map((pr, idx) => (
                      <div
                        key={`${pr.exerciseName}-${idx}`}
                        className="flex items-center justify-between rounded-xl bg-[#171A18] px-3 py-2 text-xs"
                      >
                        <span className="truncate font-medium text-[#F3F5F2]">{pr.exerciseName}</span>
                        <span className="shrink-0 tabular-nums font-bold text-[#B7F36B]">
                          {displayWeight(pr.weightKg, unit, 1)} {wUnit} × {pr.reps}{' '}
                          <span className="font-normal text-[#727B74]">({pr.date})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#727B74]">Complete workouts to set your first personal records.</p>
                )}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Customize Dashboard Widgets Modal */}
      <ModalShell
        isOpen={customizeOpen}
        title="Customize Dashboard"
        subtitle="Choose which metrics appear on Today"
        variant="sheet"
        onClose={() => setCustomizeOpen(false)}
      >
        <div className="space-y-2">
          {ALL_WIDGETS.map((w) => {
            const enabled = widgets.has(w.id);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => toggleWidget(w.id)}
                className={`flex min-h-[54px] w-full items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left transition ${
                  enabled
                    ? 'border-[#B7F36B]/40 bg-[#B7F36B]/10'
                    : 'border-[#303832] bg-[#1D221F]'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-[#F3F5F2]">{w.label}</p>
                  <p className="text-xs text-[#A1AAA3]">{w.description}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    enabled ? 'bg-[#B7F36B] text-[#101211]' : 'bg-[#252B27] text-[#727B74]'
                  }`}
                >
                  {enabled ? 'Shown' : 'Hidden'}
                </span>
              </button>
            );
          })}
        </div>
      </ModalShell>
    </div>
  );
}
