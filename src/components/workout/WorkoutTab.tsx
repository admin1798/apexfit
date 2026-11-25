import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Edit3,
  Info,
  Play,
  Plus,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { displayWeight, weightLabel } from '../../services/units';
import {
  MUSCLE_GROUPS,
  calculateWorkoutStreak,
  formatDuration,
  toLocalDateKey,
} from '../../services/workoutMetrics';
import type { Exercise, MuscleGroup, ProgramType, Routine, WorkoutSession } from '../../types';
import { Badge, Button, Card, SearchInput, Tabs } from '../ui/primitives';
import { ExerciseDetailModal } from './ExerciseDetailModal';
import { RoutineEditorModal } from './RoutineEditorModal';

interface WorkoutTabProps {
  onStartRoutine: (routine: Routine) => void;
  onStartEmptyWorkout: () => void;
  hasActiveWorkout: boolean;
  onResumeWorkout: () => void;
}

const PROGRAM_FILTERS: Array<{ id: ProgramType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'push', label: 'Push' },
  { id: 'pull', label: 'Pull' },
  { id: 'legs', label: 'Legs' },
  { id: 'upper', label: 'Upper' },
  { id: 'lower', label: 'Lower' },
  { id: 'full_body', label: 'Full Body' },
  { id: 'custom', label: 'Custom' },
];

export function WorkoutTab({
  onStartRoutine,
  onStartEmptyWorkout,
  hasActiveWorkout,
  onResumeWorkout,
}: WorkoutTabProps) {
  const [todayKey] = useState(() => toLocalDateKey(new Date()));
  const [subTab, setSubTab] = useState<'routines' | 'library' | 'history'>('routines');
  const [programFilter, setProgramFilter] = useState<ProgramType | 'all'>('all');
  const [editingRoutine, setEditingRoutine] = useState<Routine | null | 'new'>(null);

  // Library state
  const [libQuery, setLibQuery] = useState('');
  const [libMuscle, setLibMuscle] = useState<MuscleGroup | 'All'>('All');
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

  // Calendar / History state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const routines = useLiveQuery(() => db.routines.toArray(), [], []);
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [], []);
  const sessions = useLiveQuery(
    () => db.workoutSessions.orderBy('startedAt').reverse().toArray(),
    [],
    []
  );

  const unit = profile?.unitSystem ?? 'metric';
  const wUnit = weightLabel(unit);
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  const filteredRoutines =
    programFilter === 'all'
      ? routines
      : routines.filter((r) => (r.programType ?? 'custom') === programFilter);

  const filteredExercises = exercises.filter((ex) => {
    const mGroup = libMuscle === 'All' || ex.muscleGroup === libMuscle;
    const mQ =
      libQuery.trim() === '' ||
      ex.name.toLowerCase().includes(libQuery.toLowerCase()) ||
      ex.equipment.toLowerCase().includes(libQuery.toLowerCase());
    return mGroup && mQ;
  });

  // Calendar grid helpers
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const workoutDaysSet = new Set(sessions.map((s) => s.startedAt.slice(0, 10)));
  const plannedWeekdaysSet = new Set(routines.flatMap((r) => r.scheduledWeekdays ?? []));

  const visibleSessions = selectedDateFilter
    ? sessions.filter((s) => s.startedAt.slice(0, 10) === selectedDateFilter)
    : sessions;

  const { sessionsThisWeek } = calculateWorkoutStreak(sessions);

  function countSessionPRs(session: WorkoutSession): number {
    return session.exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.isPR1RM || s.isPRWeight || s.isPRVolume).length,
      0
    );
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      <Tabs
        value={subTab}
        onChange={setSubTab}
        options={[
          { id: 'routines', label: 'Programs', count: routines.length },
          { id: 'library', label: 'Exercises', count: exercises.length },
          { id: 'history', label: 'Calendar', count: sessions.length },
        ]}
      />

      {subTab === 'routines' && (
        <div className="space-y-3">
          {hasActiveWorkout ? (
            <Button className="w-full" size="lg" onClick={onResumeWorkout}>
              <Play className="h-4 w-4 fill-[#101211]" />
              Resume Active Workout
            </Button>
          ) : (
            <Button variant="secondary" className="w-full" size="lg" onClick={onStartEmptyWorkout}>
              <Plus className="h-4 w-4 text-[#B7F36B]" />
              Start Empty Freestyle Workout
            </Button>
          )}

          {/* Split Filter Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PROGRAM_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setProgramFilter(f.id)}
                className={`min-h-[36px] shrink-0 rounded-full px-3 text-xs font-semibold transition ${
                  programFilter === f.id
                    ? 'bg-[#B7F36B] text-[#101211]'
                    : 'border border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1AAA3]">
              Training Programs ({filteredRoutines.length})
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setEditingRoutine('new')}>
              <Plus className="h-3.5 w-3.5 text-[#B7F36B]" />
              New Program
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filteredRoutines.map((routine) => (
              <Card key={routine.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span
                      className="inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${routine.accentColor}22`,
                        color: routine.accentColor,
                      }}
                    >
                      {routine.dayLabel}
                    </span>
                    <h3 className="mt-1.5 truncate text-base font-bold text-[#F3F5F2]">
                      {routine.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[#A1AAA3]">
                      {routine.items
                        .map((i) => exMap.get(i.exerciseId)?.name ?? i.exerciseId)
                        .join(' • ')}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditingRoutine(routine)}
                    aria-label={`Edit ${routine.name}`}
                    className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[#303832] bg-[#171A18] text-[#A1AAA3] hover:text-[#F3F5F2]"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-[#727B74]">
                    {routine.items.length} exercises •{' '}
                    {routine.items.reduce((s, i) => s + i.defaultSets, 0)} sets
                  </span>

                  <Button
                    size="sm"
                    onClick={() => (hasActiveWorkout ? onResumeWorkout() : onStartRoutine(routine))}
                  >
                    <Play className="h-3.5 w-3.5 fill-[#101211]" />
                    Start
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {subTab === 'library' && (
        <div className="space-y-3">
          <SearchInput
            value={libQuery}
            onChange={setLibQuery}
            placeholder="Search exercise library, equipment..."
          />

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['All', ...MUSCLE_GROUPS] as const).map((mg) => (
              <button
                key={mg}
                type="button"
                onClick={() => setLibMuscle(mg)}
                className={`min-h-[36px] shrink-0 rounded-full px-3 text-xs font-semibold transition ${
                  libMuscle === mg
                    ? 'bg-[#B7F36B] text-[#101211]'
                    : 'border border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
                }`}
              >
                {mg}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {filteredExercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => setDetailExercise(ex)}
                className="flex min-h-[60px] w-full items-center justify-between gap-2 rounded-2xl border border-[#252B28] bg-[#1D221F] px-3.5 py-2.5 text-left transition hover:border-[#303832]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#F3F5F2]">{ex.name}</p>
                  <p className="text-xs text-[#A1AAA3]">
                    {ex.muscleGroup} • {ex.equipment} • {ex.category ?? 'Exercise'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {ex.notes && <BookOpen className="h-3.5 w-3.5 text-[#EAB765]" />}
                  <Info className="h-4 w-4 text-[#B7F36B]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {subTab === 'history' && (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-[#B7F36B]" />
                <div>
                  <h2 className="text-sm font-bold text-[#F3F5F2]">
                    {calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                  </h2>
                  <p className="text-[11px] text-[#A1AAA3]">
                    {sessionsThisWeek} workouts this week • Consistency tracker
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
                  aria-label="Previous month"
                  className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl bg-[#252B27] text-[#F3F5F2]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
                  aria-label="Next month"
                  className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl bg-[#252B27] text-[#F3F5F2]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-[#727B74]">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <span key={i} className="py-1">
                  {d}
                </span>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const dayNum = i + 1;
                const dateObj = new Date(year, month, dayNum);
                const key = toLocalDateKey(dateObj);
                const hasWorkout = workoutDaysSet.has(key);
                const isPlanned = plannedWeekdaysSet.has(dateObj.getDay());
                const isPast = key < todayKey;
                const isMissed = isPlanned && isPast && !hasWorkout;
                const isUpcomingPlanned = isPlanned && !isPast && !hasWorkout;
                const isSelected = selectedDateFilter === key;

                let cellStyle = 'text-[#A1AAA3] hover:bg-[#252B27]';
                if (isSelected) {
                  cellStyle = 'bg-[#B7F36B] font-bold text-[#101211]';
                } else if (hasWorkout) {
                  cellStyle = 'bg-[#B7F36B]/15 text-[#B7F36B] ring-1 ring-[#B7F36B]/35';
                } else if (isUpcomingPlanned) {
                  cellStyle = 'bg-[#79B8F5]/12 text-[#79B8F5] ring-1 ring-[#79B8F5]/30';
                } else if (isMissed) {
                  cellStyle = 'bg-[#E87979]/10 text-[#E87979]';
                }

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDateFilter((prev) => (prev === key ? null : key))}
                    className={`relative flex min-h-[38px] flex-col items-center justify-center rounded-xl text-xs font-medium transition ${cellStyle}`}
                  >
                    <span className="tabular-nums">{dayNum}</span>
                    {hasWorkout && !isSelected && (
                      <span className="mt-0.5 h-1 w-1 rounded-full bg-[#B7F36B]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Calendar Legend */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] text-[#A1AAA3]">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#B7F36B]" /> Completed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#79B8F5]" /> Planned
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#E87979]" /> Missed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#303832]" /> Rest
              </span>
            </div>

            {selectedDateFilter && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 w-full"
                onClick={() => setSelectedDateFilter(null)}
              >
                Showing {selectedDateFilter} — Show all sessions
              </Button>
            )}
          </Card>

          <div className="space-y-3">
            {visibleSessions.map((session) => {
              const prs = countSessionPRs(session);
              const isExpanded = expandedSessionId === session.id;
              const dateDisplay = new Date(session.startedAt).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });

              return (
                <Card key={session.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSessionId((prev) => (prev === session.id ? null : session.id))
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#A1AAA3]">{dateDisplay}</p>
                        <h3 className="mt-0.5 truncate text-base font-bold text-[#F3F5F2]">
                          {session.routineName}
                        </h3>
                      </div>

                      {prs > 0 && (
                        <Badge tone="lime">
                          <Trophy className="h-3 w-3" />
                          {prs} PR{prs > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center gap-4 text-xs text-[#A1AAA3]">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="h-3.5 w-3.5 text-[#727B74]" />
                        {formatDuration(session.durationSeconds)}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Dumbbell className="h-3.5 w-3.5 text-[#727B74]" />
                        {displayWeight(session.totalVolumeKg, unit, 0).toLocaleString()} {wUnit}
                      </span>
                      <span>{session.exercises.length} exercises</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2.5 border-t border-[#252B28] pt-3">
                      {session.exercises.map((ex, i) => (
                        <div key={`${ex.exerciseId}-${i}`} className="rounded-2xl bg-[#171A18] p-3">
                          <p className="text-xs font-bold text-[#B7F36B]">{ex.exerciseName}</p>
                          {ex.notes && (
                            <p className="mt-0.5 text-[11px] italic text-[#A1AAA3]">
                              Note: {ex.notes}
                            </p>
                          )}
                          <div className="mt-1.5 space-y-1">
                            {ex.sets.map((s, sIdx) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between text-xs text-[#F3F5F2]"
                              >
                                <span className="tabular-nums text-[#727B74]">
                                  Set {sIdx + 1}
                                  {s.setType !== 'working' ? ` (${s.setType})` : ''}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="tabular-nums font-medium">
                                    {displayWeight(s.weightKg ?? 0, unit, 1)} {wUnit} × {s.reps ?? 0}
                                    {s.rpe ? ` @ RPE ${s.rpe}` : ''}
                                  </span>
                                  {(s.isPR1RM || s.isPRWeight || s.isPRVolume) && (
                                    <span className="rounded bg-[#B7F36B]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#B7F36B]">
                                      PR
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}

            {visibleSessions.length === 0 && (
              <p className="py-8 text-center text-sm text-[#727B74]">
                No workouts logged for this filter yet.
              </p>
            )}
          </div>
        </div>
      )}

      {editingRoutine !== null && (
        <RoutineEditorModal
          routine={editingRoutine === 'new' ? null : editingRoutine}
          onClose={() => setEditingRoutine(null)}
        />
      )}

      <ExerciseDetailModal
        key={detailExercise?.id ?? 'none'}
        exercise={detailExercise}
        unitSystem={unit}
        onClose={() => setDetailExercise(null)}
      />
    </div>
  );
}
