import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Info, Plus } from 'lucide-react';
import { useState } from 'react';
import { db } from '../../db/database';
import { enqueueSyncMutation } from '../../services/syncService';
import { MUSCLE_GROUPS } from '../../services/workoutMetrics';
import type { Exercise, ExerciseCategory, ExerciseDifficulty, MuscleGroup, UnitSystem } from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Button, SearchInput, Select } from '../ui/primitives';
import { ExerciseDetailModal } from './ExerciseDetailModal';

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  selectedIds?: string[];
  preferredIds?: string[];
  title?: string;
  unitSystem?: UnitSystem;
}

export function ExercisePickerModal({
  isOpen,
  onClose,
  onSelect,
  selectedIds = [],
  preferredIds = [],
  title = 'Exercise Library',
  unitSystem = 'metric',
}: ExercisePickerModalProps) {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<MuscleGroup | 'All'>('All');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customGroup, setCustomGroup] = useState<MuscleGroup>('Chest');
  const [customEquipment, setCustomEquipment] = useState('Dumbbell');
  const [customCategory, setCustomCategory] = useState<ExerciseCategory>('Compound');
  const [customDifficulty, setCustomDifficulty] = useState<ExerciseDifficulty>('Intermediate');
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [], []);

  if (!isOpen) return null;

  const filtered = exercises
    .filter((ex) => {
      const matchesGroup = groupFilter === 'All' || ex.muscleGroup === groupFilter;
      const matchesQuery =
        query.trim() === '' ||
        ex.name.toLowerCase().includes(query.toLowerCase()) ||
        ex.equipment.toLowerCase().includes(query.toLowerCase()) ||
        ex.muscleGroup.toLowerCase().includes(query.toLowerCase());
      return matchesGroup && matchesQuery;
    })
    .sort((a, b) => {
      const aPref = preferredIds.includes(a.id) ? 0 : 1;
      const bPref = preferredIds.includes(b.id) ? 0 : 1;
      return aPref - bPref || a.name.localeCompare(b.name);
    });

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = customName.trim();
    if (!trimmed) return;

    const newExercise: Exercise = {
      id: `ex-custom-${Date.now()}`,
      name: trimmed,
      muscleGroup: customGroup,
      equipment: customEquipment,
      category: customCategory,
      difficulty: customDifficulty,
      isCustom: true,
    };
    await db.exercises.put(newExercise);
    await enqueueSyncMutation('exercise', newExercise.id, 'upsert', newExercise);
    setCustomName('');
    setShowCreateForm(false);
    onSelect(newExercise);
  }

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        title={title}
        subtitle={`${filtered.length} exercises`}
        onClose={onClose}
      >
        <div className="space-y-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search exercises, muscle, or equipment..."
          />

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['All', ...MUSCLE_GROUPS] as const).map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setGroupFilter(group)}
                className={`min-h-[36px] shrink-0 rounded-full px-3 text-xs font-semibold transition ${
                  groupFilter === group
                    ? 'bg-[#B7F36B] text-[#101211]'
                    : 'border border-[#303832] bg-[#1D221F] text-[#A1AAA3] hover:text-[#F3F5F2]'
                }`}
              >
                {group}
              </button>
            ))}
          </div>

          {!showCreateForm ? (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#303832] bg-[#171A18] text-xs font-semibold text-[#B7F36B] hover:bg-[#1D221F]"
            >
              <Plus className="h-4 w-4" />
              Create Custom Exercise
            </button>
          ) : (
            <form onSubmit={handleCreateCustom} className="space-y-2.5 rounded-2xl border border-[#303832] bg-[#1D221F] p-3.5">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Exercise name (e.g. Cable Crossover)"
                className="min-h-[44px] w-full rounded-xl border border-[#303832] bg-[#171A18] px-3 text-sm text-[#F3F5F2] focus:border-[#B7F36B] focus:outline-none"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={customGroup}
                  onChange={(e) => setCustomGroup(e.target.value as MuscleGroup)}
                >
                  {MUSCLE_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
                <Select value={customEquipment} onChange={(e) => setCustomEquipment(e.target.value)}>
                  {['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Kettlebell'].map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
                </Select>
                <Select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as ExerciseCategory)}
                >
                  {(['Compound', 'Isolation', 'Bodyweight', 'Cardio'] as const).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Select
                  value={customDifficulty}
                  onChange={(e) => setCustomDifficulty(e.target.value as ExerciseDifficulty)}
                >
                  {(['Beginner', 'Intermediate', 'Advanced'] as const).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save &amp; Add</Button>
              </div>
            </form>
          )}

          <div className="space-y-1.5">
            {filtered.map((ex) => {
              const isSelected = selectedIds.includes(ex.id);
              const isRecommendedAlt = preferredIds.includes(ex.id);
              return (
                <div
                  key={ex.id}
                  className={`flex min-h-[56px] items-center justify-between gap-2 rounded-2xl border px-3 py-2 ${
                    isSelected
                      ? 'border-[#B7F36B]/40 bg-[#B7F36B]/10'
                      : 'border-[#252B28] bg-[#1D221F]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(ex)}
                    className="flex min-w-0 flex-1 items-center justify-between text-left"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-[#F3F5F2]">{ex.name}</p>
                        {isRecommendedAlt && (
                          <span className="shrink-0 rounded bg-[#79B8F5]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#79B8F5]">
                            Alternative
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#A1AAA3]">
                        {ex.muscleGroup} • {ex.equipment}
                        {ex.difficulty ? ` • ${ex.difficulty}` : ''}
                      </p>
                    </div>
                    {isSelected ? (
                      <Check className="h-5 w-5 shrink-0 text-[#B7F36B]" />
                    ) : (
                      <Plus className="h-5 w-5 shrink-0 text-[#727B74]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailExercise(ex)}
                    aria-label={`View form & notes for ${ex.name}`}
                    className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl bg-[#171A18] text-[#A1AAA3] hover:text-[#B7F36B]"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-[#727B74]">No matching exercises found.</p>
            )}
          </div>
        </div>
      </ModalShell>

      <ExerciseDetailModal
        key={detailExercise?.id ?? 'none'}
        exercise={detailExercise}
        unitSystem={unitSystem}
        onClose={() => setDetailExercise(null)}
        onSwapWith={(alt) => {
          setDetailExercise(null);
          onSelect(alt);
        }}
      />
    </>
  );
}
