import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, BookOpen, CheckCircle2, History, Repeat, StickyNote } from 'lucide-react';
import { useState } from 'react';
import { db } from '../../db/database';
import { enqueueSyncMutation } from '../../services/syncService';
import { displayWeight, weightLabel } from '../../services/units';
import type { Exercise, UnitSystem } from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Badge, Button } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

interface ExerciseDetailModalProps {
  exercise: Exercise | null;
  unitSystem: UnitSystem;
  onClose: () => void;
  onSwapWith?: (alternative: Exercise) => void;
}

export function ExerciseDetailModal({
  exercise,
  unitSystem,
  onClose,
  onSwapWith,
}: ExerciseDetailModalProps) {
  const [notes, setNotes] = useState(exercise?.notes ?? '');
  const { showToast } = useToast();
  const allExercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const sessions = useLiveQuery(
    () => db.workoutSessions.orderBy('startedAt').reverse().toArray(),
    [],
    []
  );

  if (!exercise) return null;

  const wUnit = weightLabel(unitSystem);
  const exMap = new Map(allExercises.map((e) => [e.id, e]));
  const alternativeExercises = (exercise.alternatives ?? [])
    .map((id) => exMap.get(id))
    .filter((e): e is Exercise => Boolean(e));

  const pastAppearances = sessions
    .map((s) => ({
      date: s.startedAt.slice(0, 10),
      routineName: s.routineName,
      log: s.exercises.find((e) => e.exerciseId === exercise.id),
    }))
    .filter((x) => Boolean(x.log))
    .slice(0, 4);

  async function handleSaveNotes() {
    if (!exercise) return;
    const trimmed = notes.trim();
    await db.exercises.update(exercise.id, { notes: trimmed || undefined });
    await enqueueSyncMutation('exercise', exercise.id, 'upsert', { ...exercise, notes: trimmed });
    showToast('Exercise training notes saved', 'success');
  }

  return (
    <ModalShell
      isOpen={Boolean(exercise)}
      title={exercise.name}
      subtitle={`${exercise.muscleGroup} • ${exercise.equipment}`}
      onClose={onClose}
      variant="sheet"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="lime">{exercise.muscleGroup}</Badge>
          {exercise.secondaryMuscles?.map((m) => (
            <Badge key={m} tone="neutral">
              +{m}
            </Badge>
          ))}
          {exercise.category && <Badge tone="info">{exercise.category}</Badge>}
          {exercise.difficulty && <Badge tone="warning">{exercise.difficulty}</Badge>}
        </div>

        {/* Instructions */}
        {exercise.instructions && exercise.instructions.length > 0 && (
          <div className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#F3F5F2]">
              <BookOpen className="h-4 w-4 text-[#B7F36B]" />
              Execution Instructions
            </div>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#A1AAA3]">
              {exercise.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Form Cues & Common Mistakes */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {exercise.formCues && exercise.formCues.length > 0 && (
            <div className="rounded-2xl border border-[#75D69A]/25 bg-[#75D69A]/5 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#75D69A]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Form Cues
              </div>
              <ul className="space-y-1 text-xs text-[#A1AAA3]">
                {exercise.formCues.map((cue, i) => (
                  <li key={i}>• {cue}</li>
                ))}
              </ul>
            </div>
          )}

          {exercise.commonMistakes && exercise.commonMistakes.length > 0 && (
            <div className="rounded-2xl border border-[#EAB765]/25 bg-[#EAB765]/5 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#EAB765]">
                <AlertTriangle className="h-3.5 w-3.5" />
                Avoid Mistakes
              </div>
              <ul className="space-y-1 text-xs text-[#A1AAA3]">
                {exercise.commonMistakes.map((m, i) => (
                  <li key={i}>• {m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Alternatives */}
        {alternativeExercises.length > 0 && (
          <div className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#F3F5F2]">
              <Repeat className="h-4 w-4 text-[#79B8F5]" />
              Exercise Alternatives
            </div>
            <div className="space-y-1.5">
              {alternativeExercises.map((alt) => (
                <div
                  key={alt.id}
                  className="flex items-center justify-between rounded-xl bg-[#171A18] px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#F3F5F2]">{alt.name}</p>
                    <p className="text-[11px] text-[#727B74]">
                      {alt.equipment} • {alt.difficulty ?? 'All levels'}
                    </p>
                  </div>
                  {onSwapWith && (
                    <Button size="sm" variant="secondary" onClick={() => onSwapWith(alt)}>
                      Swap In
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Previous Performance */}
        <div className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#F3F5F2]">
            <History className="h-4 w-4 text-[#B7F36B]" />
            Previous Performance
          </div>
          {pastAppearances.length > 0 ? (
            <div className="space-y-2">
              {pastAppearances.map((app, i) => (
                <div key={i} className="rounded-xl bg-[#171A18] px-3 py-2 text-xs">
                  <p className="font-semibold text-[#A1AAA3]">
                    {app.date} • {app.routineName}
                  </p>
                  <p className="mt-1 tabular-nums text-[#F3F5F2]">
                    {app.log?.sets
                      .filter((s) => s.completed)
                      .map((s) => `${displayWeight(s.weightKg ?? 0, unitSystem, 1)}${wUnit}×${s.reps ?? 0}`)
                      .join('  |  ')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#727B74]">No recorded sessions for this exercise yet.</p>
          )}
        </div>

        {/* Personal Training Notes */}
        <div className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#F3F5F2]">
            <StickyNote className="h-4 w-4 text-[#EAB765]" />
            Personal Training Notes
          </div>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Seat pin #4, pause 1s on chest, wrist wraps on top set..."
            className="w-full rounded-xl border border-[#303832] bg-[#171A18] p-2.5 text-xs text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
          />
          <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={handleSaveNotes}>
            Save Notes
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
