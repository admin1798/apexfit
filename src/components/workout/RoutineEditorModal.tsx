import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { db } from '../../db/database';
import { enqueueSyncMutation } from '../../services/syncService';
import type { Exercise, ProgramType, Routine, RoutineExerciseItem } from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Button, Input, Select } from '../ui/primitives';
import { useToast } from '../ui/toastContext';
import { ExercisePickerModal } from './ExercisePickerModal';

interface RoutineEditorModalProps {
  routine: Routine | null;
  onClose: () => void;
}

const ACCENT_OPTIONS = ['#B7F36B', '#79B8F5', '#75D69A', '#EAB765', '#E87979'];
const REST_PRESETS = [60, 90, 120, 180];
const PROGRAM_TYPES: Array<{ id: ProgramType; label: string }> = [
  { id: 'push', label: 'Push' },
  { id: 'pull', label: 'Pull' },
  { id: 'legs', label: 'Legs' },
  { id: 'upper', label: 'Upper Body' },
  { id: 'lower', label: 'Lower Body' },
  { id: 'full_body', label: 'Full Body' },
  { id: 'custom', label: 'Custom' },
];
const WEEKDAYS = [
  { day: 0, short: 'Sun' },
  { day: 1, short: 'Mon' },
  { day: 2, short: 'Tue' },
  { day: 3, short: 'Wed' },
  { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' },
  { day: 6, short: 'Sat' },
];

export function RoutineEditorModal({ routine, onClose }: RoutineEditorModalProps) {
  const [name, setName] = useState(routine?.name ?? '');
  const [dayLabel, setDayLabel] = useState(routine?.dayLabel ?? 'Custom');
  const [programType, setProgramType] = useState<ProgramType>(routine?.programType ?? 'custom');
  const [scheduledWeekdays, setScheduledWeekdays] = useState<number[]>(
    routine?.scheduledWeekdays ?? []
  );
  const [accentColor, setAccentColor] = useState(routine?.accentColor ?? '#B7F36B');
  const [items, setItems] = useState<RoutineExerciseItem[]>(routine?.items ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { showToast } = useToast();
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  function handleAddExercise(ex: Exercise) {
    if (items.some((i) => i.exerciseId === ex.id)) {
      setPickerOpen(false);
      return;
    }
    setItems((prev) => [...prev, { exerciseId: ex.id, defaultSets: 3, restSeconds: 90 }]);
    setPickerOpen(false);
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    const [removed] = copy.splice(idx, 1);
    copy.splice(target, 0, removed);
    setItems(copy);
  }

  function toggleWeekday(day: number) {
    setScheduledWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || items.length === 0) return;

    const payload: Routine = {
      id: routine?.id ?? `routine-${Date.now()}`,
      name: trimmedName,
      dayLabel: dayLabel.trim() || 'Workout',
      programType,
      scheduledWeekdays,
      accentColor,
      items,
      lastPerformedAt: routine?.lastPerformedAt,
    };

    await db.routines.put(payload);
    await enqueueSyncMutation('routine', payload.id, 'upsert', payload);
    showToast(`Saved routine "${payload.name}"`, 'success');
    onClose();
  }

  async function handleDelete() {
    if (!routine) return;
    await db.routines.delete(routine.id);
    await enqueueSyncMutation('routine', routine.id, 'delete');
    showToast(`Deleted "${routine.name}"`, 'info');
    onClose();
  }

  return (
    <>
      <ModalShell
        isOpen
        title={routine ? 'Edit Program' : 'New Training Program'}
        onClose={onClose}
        footer={
          <div className="flex gap-2">
            {routine && (
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!name.trim() || items.length === 0}
              onClick={handleSave}
            >
              Save Program
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-[#252B28] bg-[#1D221F] p-3.5">
            <Input
              label="Program Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Push Day (Chest / Shoulders)"
              required
            />

            <div className="grid grid-cols-2 gap-2.5">
              <Select
                label="Program Split"
                value={programType}
                onChange={(e) => {
                  const pt = e.target.value as ProgramType;
                  setProgramType(pt);
                  const found = PROGRAM_TYPES.find((p) => p.id === pt);
                  if (found && (!dayLabel || dayLabel === 'Custom')) {
                    setDayLabel(found.label);
                  }
                }}
              >
                {PROGRAM_TYPES.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.label}
                  </option>
                ))}
              </Select>

              <Input
                label="Badge Label"
                value={dayLabel}
                onChange={(e) => setDayLabel(e.target.value)}
                placeholder="Push A"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[#A1AAA3]">
                Planned Days (for Calendar)
              </span>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => {
                  const active = scheduledWeekdays.includes(w.day);
                  return (
                    <button
                      key={w.day}
                      type="button"
                      onClick={() => toggleWeekday(w.day)}
                      className={`min-h-[36px] rounded-xl text-[11px] font-semibold transition ${
                        active
                          ? 'bg-[#B7F36B] text-[#101211]'
                          : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                      }`}
                    >
                      {w.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[#A1AAA3]">Accent Color</span>
              <div className="flex items-center gap-2.5">
                {ACCENT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAccentColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      accentColor === c ? 'scale-110 border-[#F3F5F2]' : 'border-transparent opacity-60'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1AAA3]">
                Exercises ({items.length})
              </h3>
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                <Plus className="h-3.5 w-3.5 text-[#B7F36B]" />
                Add Exercise
              </Button>
            </div>

            {items.map((item, idx) => {
              const ex = exMap.get(item.exerciseId);
              return (
                <div
                  key={item.exerciseId}
                  className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#F3F5F2]">
                        {ex?.name ?? item.exerciseId}
                      </p>
                      <p className="text-xs text-[#A1AAA3]">{ex?.muscleGroup}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-[#252B27] text-[#F3F5F2] disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === items.length - 1}
                        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-[#252B27] text-[#F3F5F2] disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-[#E87979]/15 text-[#E87979]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-[#252B28] pt-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#A1AAA3]">Sets:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.defaultSets}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(10, parseInt(e.target.value || '1', 10) || 1));
                          setItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, defaultSets: v } : it))
                          );
                        }}
                        className="min-h-[36px] w-14 rounded-lg border border-[#303832] bg-[#171A18] text-center text-sm font-semibold text-[#F3F5F2]"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="mr-1 text-xs text-[#A1AAA3]">Rest:</span>
                      {REST_PRESETS.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() =>
                            setItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, restSeconds: sec } : it))
                            )
                          }
                          className={`min-h-[32px] rounded-lg px-2 text-xs font-semibold ${
                            item.restSeconds === sec
                              ? 'bg-[#B7F36B] text-[#101211]'
                              : 'bg-[#252B27] text-[#A1AAA3]'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {items.length === 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex min-h-[80px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#303832] text-xs text-[#A1AAA3]"
              >
                <Plus className="mb-1 h-5 w-5 text-[#B7F36B]" />
                Tap to add exercises to this program
              </button>
            )}
          </div>
        </form>
      </ModalShell>

      <ExercisePickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAddExercise}
        selectedIds={items.map((i) => i.exerciseId)}
      />
    </>
  );
}
