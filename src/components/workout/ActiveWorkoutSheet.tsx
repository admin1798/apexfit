import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Info,
  Minus,
  Plus,
  RefreshCw,
  StickyNote,
  Timer,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { useRestTimer } from '../../hooks/useRestTimer';
import { enqueueSyncMutation } from '../../services/syncService';
import { displayWeight, inputToKg, weightLabel } from '../../services/units';
import {
  calculateSessionVolume,
  formatDuration,
  getPreviousExerciseSets,
  stampPersonalRecords,
} from '../../services/workoutMetrics';
import type {
  ActiveWorkoutDraft,
  Exercise,
  SetType,
  WorkoutSession,
  WorkoutSetLog,
} from '../../types';
import { ConfirmDialog } from '../ui/Overlay';
import { Button } from '../ui/primitives';
import { useToast } from '../ui/toastContext';
import { ExerciseDetailModal } from './ExerciseDetailModal';
import { ExercisePickerModal } from './ExercisePickerModal';

interface ActiveWorkoutSheetProps {
  draft: ActiveWorkoutDraft;
  onUpdateDraft: (next: ActiveWorkoutDraft) => void;
  onMinimize: () => void;
  onFinishSession: (saved: WorkoutSession) => void;
  onDiscard: () => void;
}

const SET_TYPE_BADGE: Record<SetType, { short: string; cls: string; label: string }> = {
  working: { short: 'S', cls: 'bg-[#252B27] text-[#F3F5F2]', label: 'Working' },
  warmup: { short: 'W', cls: 'bg-[#EAB765]/20 text-[#EAB765]', label: 'Warmup' },
  drop: { short: 'D', cls: 'bg-[#79B8F5]/20 text-[#79B8F5]', label: 'Drop' },
  failure: { short: 'F', cls: 'bg-[#E87979]/20 text-[#E87979]', label: 'Failure' },
};

const SET_TYPE_ORDER: SetType[] = ['working', 'warmup', 'drop', 'failure'];
const REST_PRESETS = [60, 90, 120, 180];

export function ActiveWorkoutSheet({
  draft,
  onUpdateDraft,
  onMinimize,
  onFinishSession,
  onDiscard,
}: ActiveWorkoutSheetProps) {
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(draft.startedAt).getTime()) / 1000))
  );
  const [pickerMode, setPickerMode] = useState<{ open: boolean; replaceIndex: number | null }>({
    open: false,
    replaceIndex: null,
  });
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [openNotesSet, setOpenNotesSet] = useState<Record<number, boolean>>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [completedSummary, setCompletedSummary] = useState<WorkoutSession | null>(null);

  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const restTimer = useRestTimer({
    soundEnabled: profile?.restSoundEnabled ?? true,
    vibrateEnabled: profile?.restVibrateEnabled ?? true,
  });
  const { showToast } = useToast();
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const pastSessions = useLiveQuery(() => db.workoutSessions.toArray(), [], []);

  const unit = profile?.unitSystem ?? 'metric';
  const wUnit = weightLabel(unit);
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSec(
        Math.max(0, Math.floor((Date.now() - new Date(draft.startedAt).getTime()) / 1000))
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [draft.startedAt]);

  const liveVolumeKg = calculateSessionVolume({ exercises: draft.exercises });
  const liveVolumeDisplay = displayWeight(liveVolumeKg, unit, 0);
  const completedSetsCount = draft.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0
  );

  function updateSet(
    exIdx: number,
    setIdx: number,
    patch: Partial<WorkoutSetLog>,
    restSecondsToStart?: number
  ) {
    const nextExercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const nextSets = ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s));
      return { ...ex, sets: nextSets };
    });
    onUpdateDraft({ ...draft, exercises: nextExercises });
    if (restSecondsToStart !== undefined) {
      restTimer.start(restSecondsToStart);
    }
  }

  function handleToggleComplete(
    exIdx: number,
    setIdx: number,
    prevHint?: { weightKg: number | null; reps: number | null }
  ) {
    const ex = draft.exercises[exIdx];
    const currentSet = ex.sets[setIdx];
    const nextCompleted = !currentSet.completed;

    const filledWeight =
      currentSet.weightKg !== null ? currentSet.weightKg : prevHint?.weightKg ?? 0;
    const filledReps = currentSet.reps !== null ? currentSet.reps : prevHint?.reps ?? 0;

    updateSet(
      exIdx,
      setIdx,
      {
        completed: nextCompleted,
        weightKg: nextCompleted ? filledWeight : currentSet.weightKg,
        reps: nextCompleted ? filledReps : currentSet.reps,
      },
      nextCompleted ? ex.restSeconds : undefined
    );
  }

  function cycleSetType(exIdx: number, setIdx: number) {
    const cur = draft.exercises[exIdx].sets[setIdx].setType;
    const next = SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(cur) + 1) % SET_TYPE_ORDER.length];
    updateSet(exIdx, setIdx, { setType: next });
  }

  function addSet(exIdx: number) {
    const nextExercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return {
        ...ex,
        sets: [
          ...ex.sets,
          {
            id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            weightKg: last?.weightKg ?? null,
            reps: last?.reps ?? null,
            rpe: last?.rpe ?? null,
            setType: 'working' as SetType,
            completed: false,
          },
        ],
      };
    });
    onUpdateDraft({ ...draft, exercises: nextExercises });
  }

  function removeSet(exIdx: number, setIdx: number) {
    const nextExercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx || ex.sets.length <= 1) return ex;
      return { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) };
    });
    onUpdateDraft({ ...draft, exercises: nextExercises });
  }

  function moveExercise(exIdx: number, dir: -1 | 1) {
    const target = exIdx + dir;
    if (target < 0 || target >= draft.exercises.length) return;
    const copy = [...draft.exercises];
    const [removed] = copy.splice(exIdx, 1);
    copy.splice(target, 0, removed);
    onUpdateDraft({ ...draft, exercises: copy });
  }

  function removeExercise(exIdx: number) {
    onUpdateDraft({
      ...draft,
      exercises: draft.exercises.filter((_, i) => i !== exIdx),
    });
    showToast('Removed exercise from session', 'info');
  }

  function updateExerciseNotes(exIdx: number, notes: string) {
    onUpdateDraft({
      ...draft,
      exercises: draft.exercises.map((ex, i) => (i === exIdx ? { ...ex, notes } : ex)),
    });
  }

  function updateExerciseRest(exIdx: number, restSeconds: number) {
    onUpdateDraft({
      ...draft,
      exercises: draft.exercises.map((ex, i) => (i === exIdx ? { ...ex, restSeconds } : ex)),
    });
  }

  function handleSelectFromPicker(ex: Exercise) {
    const replaceIdx = pickerMode.replaceIndex;
    setPickerMode({ open: false, replaceIndex: null });

    const prevSets = getPreviousExerciseSets(ex.id, pastSessions);
    const count =
      replaceIdx !== null
        ? draft.exercises[replaceIdx]?.sets.length ?? 3
        : Math.max(3, prevSets.length || 3);

    const newBlock = {
      exerciseId: ex.id,
      exerciseName: ex.name,
      muscleGroup: ex.muscleGroup,
      restSeconds: profile?.defaultRestSeconds ?? 90,
      sets: Array.from({ length: count }, (_, idx) => ({
        id: `set-${Date.now()}-${idx}`,
        weightKg: null,
        reps: null,
        rpe: null,
        setType: 'working' as SetType,
        completed: false,
      })),
    };

    if (replaceIdx !== null) {
      onUpdateDraft({
        ...draft,
        exercises: draft.exercises.map((item, i) => (i === replaceIdx ? newBlock : item)),
      });
      showToast(`Swapped to ${ex.name}`, 'success');
    } else {
      onUpdateDraft({
        ...draft,
        exercises: [...draft.exercises, newBlock],
      });
    }
  }

  async function handleFinishWorkout() {
    restTimer.stop();
    const endedAt = new Date().toISOString();
    const rawSession: WorkoutSession = {
      id: draft.id,
      routineId: draft.routineId,
      routineName: draft.routineName,
      startedAt: draft.startedAt,
      endedAt,
      durationSeconds: elapsedSec,
      totalVolumeKg: liveVolumeKg,
      notes: draft.notes.trim() || undefined,
      exercises: draft.exercises.map((ex) => ({
        ...ex,
        notes: ex.notes?.trim() || undefined,
        sets: ex.sets.filter((s) => s.completed || (s.weightKg !== null && s.reps !== null)),
      })),
    };

    const stamped = stampPersonalRecords(rawSession, pastSessions);
    await db.workoutSessions.put(stamped);
    await enqueueSyncMutation('workoutSession', stamped.id, 'upsert', stamped);
    if (draft.routineId) {
      await db.routines.update(draft.routineId, { lastPerformedAt: draft.startedAt });
    }
    setCompletedSummary(stamped);
  }

  if (completedSummary) {
    const prCount = completedSummary.exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.isPR1RM || s.isPRWeight || s.isPRVolume).length,
      0
    );

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101211]/95 p-4 backdrop-blur-xl">
        <div className="w-full max-w-[390px] rounded-3xl border border-[#303832] bg-[#1D221F] p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B7F36B]/15 text-[#B7F36B]">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-[#F3F5F2]">Workout Logged</h2>
          <p className="mt-1 text-sm text-[#A1AAA3]">{completedSummary.routineName}</p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-[#171A18] p-3">
              <p className="text-[11px] text-[#A1AAA3]">Duration</p>
              <p className="mt-1 tabular-nums text-sm font-bold text-[#F3F5F2]">
                {formatDuration(completedSummary.durationSeconds)}
              </p>
            </div>
            <div className="rounded-2xl bg-[#171A18] p-3">
              <p className="text-[11px] text-[#A1AAA3]">Volume</p>
              <p className="mt-1 tabular-nums text-sm font-bold text-[#B7F36B]">
                {displayWeight(completedSummary.totalVolumeKg, unit, 0).toLocaleString()} {wUnit}
              </p>
            </div>
            <div className="rounded-2xl bg-[#171A18] p-3">
              <p className="text-[11px] text-[#A1AAA3]">New PRs</p>
              <p className="mt-1 tabular-nums text-sm font-bold text-[#EAB765]">{prCount}</p>
            </div>
          </div>

          <Button className="mt-6 w-full" size="lg" onClick={() => onFinishSession(completedSummary)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const replacingExercise =
    pickerMode.replaceIndex !== null
      ? exMap.get(draft.exercises[pickerMode.replaceIndex]?.exerciseId ?? '')
      : undefined;

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-[#101211]">
        <header className="sticky top-0 z-20 border-b border-[#252B28] bg-[#101211]/95 backdrop-blur-xl pt-safe">
          <div className="mx-auto max-w-[600px] px-4 pb-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onMinimize}
                aria-label="Minimize active workout"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#303832] bg-[#1D221F] text-[#F3F5F2]"
              >
                <ChevronDown className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1 text-center">
                <p className="truncate text-sm font-bold text-[#F3F5F2]">{draft.routineName}</p>
                <div className="mt-0.5 flex items-center justify-center gap-3 text-xs text-[#A1AAA3]">
                  <span className="inline-flex items-center gap-1 tabular-nums text-[#B7F36B]">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(elapsedSec)}
                  </span>
                  <span className="tabular-nums">
                    • {liveVolumeDisplay.toLocaleString()} {wUnit}
                  </span>
                  <span className="tabular-nums">• {completedSetsCount} sets</span>
                </div>
              </div>

              <Button size="sm" onClick={handleFinishWorkout}>
                Finish
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[600px] flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-36">
          {draft.exercises.map((ex, exIdx) => {
            const prevSets = getPreviousExerciseSets(ex.exerciseId, pastSessions);
            const libEx = exMap.get(ex.exerciseId);
            const notesVisible = openNotesSet[exIdx] || Boolean(ex.notes);

            return (
              <section
                key={`${ex.exerciseId}-${exIdx}`}
                className="rounded-3xl border border-[#252B28] bg-[#1D221F] p-3.5"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => libEx && setDetailExercise(libEx)}
                        className="truncate text-left text-base font-bold text-[#B7F36B] hover:underline"
                      >
                        {ex.exerciseName}
                      </button>
                      {libEx && (
                        <button
                          type="button"
                          onClick={() => setDetailExercise(libEx)}
                          aria-label={`Details for ${ex.exerciseName}`}
                          className="text-[#727B74] hover:text-[#F3F5F2]"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#A1AAA3]">{ex.muscleGroup}</p>
                  </div>

                  {/* Quick Exercise Controls: Note, Swap, Reorder, Remove */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenNotesSet((p) => ({ ...p, [exIdx]: !p[exIdx] }))
                      }
                      aria-label="Toggle exercise note"
                      className={`inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl ${
                        notesVisible ? 'bg-[#EAB765]/20 text-[#EAB765]' : 'bg-[#252B27] text-[#A1AAA3]'
                      }`}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerMode({ open: true, replaceIndex: exIdx })}
                      aria-label={`Replace ${ex.exerciseName}`}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl bg-[#252B27] text-[#79B8F5]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveExercise(exIdx, -1)}
                      disabled={exIdx === 0}
                      aria-label="Move exercise up"
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl bg-[#252B27] text-[#A1AAA3] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveExercise(exIdx, 1)}
                      disabled={exIdx === draft.exercises.length - 1}
                      aria-label="Move exercise down"
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl bg-[#252B27] text-[#A1AAA3] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeExercise(exIdx)}
                      aria-label={`Remove ${ex.exerciseName}`}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl bg-[#E87979]/10 text-[#E87979]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Rest Presets Row */}
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#727B74]">Auto rest timer:</span>
                  <div className="flex items-center gap-1">
                    {REST_PRESETS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => updateExerciseRest(exIdx, sec)}
                        className={`min-h-[28px] rounded-lg px-2 text-[11px] font-semibold transition ${
                          ex.restSeconds === sec
                            ? 'bg-[#79B8F5]/20 text-[#79B8F5] ring-1 ring-[#79B8F5]/40'
                            : 'bg-[#171A18] text-[#727B74]'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                {notesVisible && (
                  <input
                    type="text"
                    value={ex.notes ?? ''}
                    onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                    placeholder="Session note (e.g. felt strong, pause reps)..."
                    className="mb-2.5 min-h-[38px] w-full rounded-xl border border-[#303832] bg-[#171A18] px-3 text-xs text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
                  />
                )}

                <div className="mb-1.5 grid grid-cols-[40px_1fr_64px_60px_48px_44px] items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[#727B74]">
                  <span className="text-center">Set</span>
                  <span>Prev</span>
                  <span className="text-center">{wUnit}</span>
                  <span className="text-center">Reps</span>
                  <span className="text-center">RPE</span>
                  <span className="text-center">Done</span>
                </div>

                <div className="space-y-1.5">
                  {ex.sets.map((set, setIdx) => {
                    const prev = prevSets[setIdx];
                    const badge = SET_TYPE_BADGE[set.setType];
                    const prevWeightDisplay =
                      prev?.weightKg !== null && prev?.weightKg !== undefined
                        ? displayWeight(prev.weightKg, unit, 1)
                        : null;
                    const weightDisplayVal =
                      set.weightKg !== null ? displayWeight(set.weightKg, unit, 1) : '';

                    return (
                      <div
                        key={set.id}
                        className={`grid grid-cols-[40px_1fr_64px_60px_48px_44px] items-center gap-1.5 rounded-2xl p-1 transition ${
                          set.completed ? 'bg-[#B7F36B]/10' : 'bg-[#171A18]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => cycleSetType(exIdx, setIdx)}
                          title={`Set type: ${badge.label}`}
                          className={`flex min-h-[44px] items-center justify-center rounded-xl text-xs font-bold ${badge.cls}`}
                        >
                          {set.setType === 'working' ? setIdx + 1 : badge.short}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (prev) {
                              updateSet(exIdx, setIdx, {
                                weightKg: prev.weightKg,
                                reps: prev.reps,
                              });
                            }
                          }}
                          className="min-h-[44px] truncate text-left text-xs tabular-nums text-[#727B74]"
                        >
                          {prevWeightDisplay !== null && prev?.reps !== null
                            ? `${prevWeightDisplay}×${prev.reps}`
                            : '—'}
                        </button>

                        <input
                          type="text"
                          inputMode="decimal"
                          value={weightDisplayVal}
                          placeholder={prevWeightDisplay !== null ? String(prevWeightDisplay) : '0'}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = raw === '' ? null : parseFloat(raw);
                            updateSet(exIdx, setIdx, {
                              weightKg:
                                num !== null && Number.isFinite(num) ? inputToKg(num, unit) : null,
                            });
                          }}
                          className="min-h-[44px] w-full rounded-xl border border-[#303832] bg-[#1D221F] px-1 text-center text-sm font-semibold text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
                        />

                        <input
                          type="text"
                          inputMode="numeric"
                          value={set.reps ?? ''}
                          placeholder={
                            prev?.reps !== null && prev?.reps !== undefined ? String(prev.reps) : '0'
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = raw === '' ? null : parseInt(raw, 10);
                            updateSet(exIdx, setIdx, {
                              reps: num !== null && Number.isFinite(num) ? num : null,
                            });
                          }}
                          className="min-h-[44px] w-full rounded-xl border border-[#303832] bg-[#1D221F] px-1 text-center text-sm font-semibold text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
                        />

                        <input
                          type="text"
                          inputMode="decimal"
                          value={set.rpe ?? ''}
                          placeholder="8"
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = raw === '' ? null : parseFloat(raw);
                            updateSet(exIdx, setIdx, {
                              rpe: num !== null && Number.isFinite(num) ? Math.min(10, num) : null,
                            });
                          }}
                          className="min-h-[44px] w-full rounded-xl border border-[#303832] bg-[#1D221F] px-1 text-center text-xs font-medium text-[#A1AAA3] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
                        />

                        <button
                          type="button"
                          onClick={() => handleToggleComplete(exIdx, setIdx, prev)}
                          aria-label={`Complete set ${setIdx + 1}`}
                          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition active:scale-90 ${
                            set.completed
                              ? 'bg-[#B7F36B] text-[#101211]'
                              : 'border border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
                          }`}
                        >
                          <Check className="h-5 w-5 stroke-[2.5]" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => addSet(exIdx)}
                    className="flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-xl bg-[#252B27] text-xs font-semibold text-[#F3F5F2] active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#B7F36B]" />
                    Add Set
                  </button>
                  {ex.sets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSet(exIdx, ex.sets.length - 1)}
                      aria-label="Remove last set"
                      className="flex min-h-[40px] min-w-[44px] items-center justify-center rounded-xl bg-[#252B27] text-[#A1AAA3]"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          <button
            type="button"
            onClick={() => setPickerMode({ open: true, replaceIndex: null })}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#303832] bg-[#171A18] text-sm font-semibold text-[#B7F36B]"
          >
            <Plus className="h-4 w-4" />
            Add Exercise
          </button>

          <Button
            variant="danger"
            className="w-full"
            onClick={() => setConfirmDiscard(true)}
          >
            <Trash2 className="h-4 w-4" />
            Discard Workout
          </Button>
        </main>

        {restTimer.isRunning && (
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#79B8F5]/30 bg-[#171A18]/95 backdrop-blur-xl pb-safe">
            <div className="mx-auto max-w-[600px] px-4 py-3">
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[#252B27]">
                <div
                  className="h-full bg-[#79B8F5] transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (restTimer.remainingSeconds / Math.max(1, restTimer.totalDuration)) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-[#79B8F5]" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#79B8F5]">
                      Rest Timer
                    </p>
                    <p className="tabular-nums text-xl font-bold text-[#F3F5F2]">
                      {formatDuration(restTimer.remainingSeconds)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => restTimer.adjust(-15)}
                    className="min-h-[44px] rounded-xl border border-[#303832] bg-[#252B27] px-3 text-xs font-bold text-[#F3F5F2] active:scale-95"
                  >
                    -15s
                  </button>
                  <button
                    type="button"
                    onClick={() => restTimer.adjust(15)}
                    className="min-h-[44px] rounded-xl border border-[#303832] bg-[#252B27] px-3 text-xs font-bold text-[#F3F5F2] active:scale-95"
                  >
                    +15s
                  </button>
                  <button
                    type="button"
                    onClick={restTimer.stop}
                    aria-label="Skip rest timer"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-[#79B8F5] text-xs font-bold text-[#101211] active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ExercisePickerModal
        isOpen={pickerMode.open}
        title={pickerMode.replaceIndex !== null ? 'Swap Exercise' : 'Add Exercise'}
        preferredIds={replacingExercise?.alternatives ?? []}
        onClose={() => setPickerMode({ open: false, replaceIndex: null })}
        onSelect={handleSelectFromPicker}
        selectedIds={draft.exercises.map((e) => e.exerciseId)}
        unitSystem={unit}
      />

      <ExerciseDetailModal
        key={detailExercise?.id ?? 'none'}
        exercise={detailExercise}
        unitSystem={unit}
        onClose={() => setDetailExercise(null)}
      />

      <ConfirmDialog
        isOpen={confirmDiscard}
        title="Discard Active Workout?"
        description="Unsaved sets in this active session will be lost. Saved workout history will remain untouched."
        confirmLabel="Discard"
        cancelLabel="Keep Training"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          restTimer.stop();
          onDiscard();
        }}
      />
    </>
  );
}
