import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
  Camera,
  Dumbbell,
  Eye,
  EyeOff,
  Plus,
  Ruler,
  Scale,
  Trash2,
  Trophy,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { enqueueSyncMutation } from '../../services/syncService';
import {
  displayLength,
  displayWeight,
  inputToCm,
  inputToKg,
  lengthLabel,
  weightLabel,
} from '../../services/units';
import {
  MUSCLE_GROUPS,
  calculateEstimated1RM,
  offsetDateKey,
  toLocalDateKey,
} from '../../services/workoutMetrics';
import type { BodyMeasurementEntry, PhotoPose, ProgressPhotoEntry } from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Badge, Button, Card, EmptyState, Input, MetricCard, ProgressBar, Select, Tabs } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

const MEASUREMENT_FIELDS: Array<{ key: keyof BodyMeasurementEntry; label: string }> = [
  { key: 'chestCm', label: 'Chest' },
  { key: 'waistCm', label: 'Waist' },
  { key: 'shouldersCm', label: 'Shoulders' },
  { key: 'armsCm', label: 'Arms' },
  { key: 'forearmsCm', label: 'Forearms' },
  { key: 'hipsCm', label: 'Hips' },
  { key: 'thighsCm', label: 'Thighs' },
  { key: 'calvesCm', label: 'Calves' },
  { key: 'neckCm', label: 'Neck' },
];

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 760;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProgressTab() {
  const [todayKey] = useState(() => toLocalDateKey(new Date()));
  const [subTab, setSubTab] = useState<'charts' | 'measurements' | 'photos'>('charts');

  // Charts state
  const [selectedExerciseId, setSelectedExerciseId] = useState('ex-bench-press');
  const [liftMetric, setLiftMetric] = useState<'est1RM' | 'topWeight'>('est1RM');
  const [volumeWindowDays, setVolumeWindowDays] = useState<7 | 28>(7);
  const [nutritionWindowDays, setNutritionWindowDays] = useState<14 | 30>(14);
  const [weightInput, setWeightInput] = useState('');

  // Measurements state
  const [measModalOpen, setMeasModalOpen] = useState(false);
  const [measForm, setMeasForm] = useState<Record<string, string>>({});
  const [customMeasName, setCustomMeasName] = useState('');
  const [customMeasVal, setCustomMeasVal] = useState('');

  // Photos state
  const [photoPose, setPhotoPose] = useState<PhotoPose>('front');
  const [photoNote, setPhotoNote] = useState('');
  const [comparePose, setComparePose] = useState<PhotoPose>('front');
  const [compareLeftId, setCompareLeftId] = useState<string>('');
  const [compareRightId, setCompareRightId] = useState<string>('');
  const [revealPhotos, setRevealPhotos] = useState(false);

  const { showToast } = useToast();
  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const sessions = useLiveQuery(() => db.workoutSessions.orderBy('startedAt').toArray(), [], []);
  const foodLogs = useLiveQuery(() => db.foodLogs.toArray(), [], []);
  const weightLogs = useLiveQuery(() => db.weightLogs.orderBy('date').toArray(), [], []);
  const measurements = useLiveQuery(() => db.measurements.orderBy('date').toArray(), [], []);
  const photos = useLiveQuery(() => db.progressPhotos.orderBy('date').reverse().toArray(), [], []);

  const unit = profile?.unitSystem ?? 'metric';
  const wUnit = weightLabel(unit);
  const lUnit = lengthLabel(unit);

  const loggedExerciseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of sessions) {
      for (const ex of s.exercises) {
        seen.set(ex.exerciseId, ex.exerciseName);
      }
    }
    if (seen.size === 0) {
      return exercises.slice(0, 8).map((e) => ({ id: e.id, name: e.name }));
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions, exercises]);

  const activeExerciseId = loggedExerciseOptions.some((e) => e.id === selectedExerciseId)
    ? selectedExerciseId
    : loggedExerciseOptions[0]?.id ?? 'ex-bench-press';

  const liftChartData = useMemo(() => {
    const points: Array<{ date: string; est1RM: number; topWeight: number }> = [];
    for (const s of sessions) {
      const match = s.exercises.find((e) => e.exerciseId === activeExerciseId);
      if (!match) continue;
      let max1RM = 0;
      let maxW = 0;
      for (const set of match.sets) {
        if (!set.completed || set.setType === 'warmup') continue;
        const w = set.weightKg ?? 0;
        const r = set.reps ?? 0;
        if (w <= 0 || r <= 0) continue;
        maxW = Math.max(maxW, w);
        max1RM = Math.max(max1RM, calculateEstimated1RM(w, r));
      }
      if (maxW > 0) {
        points.push({
          date: s.startedAt.slice(5, 10),
          est1RM: displayWeight(max1RM, unit, 1),
          topWeight: displayWeight(maxW, unit, 1),
        });
      }
    }
    return points;
  }, [sessions, activeExerciseId, unit]);

  const muscleVolumeData = useMemo(() => {
    const cutoff = offsetDateKey(todayKey, -(volumeWindowDays - 1));
    const counts = new Map<string, number>();
    for (const mg of MUSCLE_GROUPS) counts.set(mg, 0);

    for (const s of sessions) {
      if (s.startedAt.slice(0, 10) < cutoff) continue;
      for (const ex of s.exercises) {
        const workingSets = ex.sets.filter((st) => st.completed && st.setType !== 'warmup').length;
        counts.set(ex.muscleGroup, (counts.get(ex.muscleGroup) ?? 0) + workingSets);
      }
    }

    const SHORT: Record<string, string> = {
      Chest: 'Chest',
      Back: 'Back',
      Shoulders: 'Shldr',
      Legs: 'Legs',
      Arms: 'Arms',
      Core: 'Core',
    };

    return MUSCLE_GROUPS.map((mg) => ({
      muscle: SHORT[mg] ?? mg,
      sets: counts.get(mg) ?? 0,
    }));
  }, [sessions, volumeWindowDays, todayKey]);

  const nutritionWeightData = useMemo(() => {
    const weightMap = new Map(weightLogs.map((w) => [w.date, w.weightKg]));
    const foodByDate = new Map<string, { calories: number; protein: number }>();
    for (const f of foodLogs) {
      const cur = foodByDate.get(f.date) ?? { calories: 0, protein: 0 };
      cur.calories += f.calories;
      cur.protein += f.protein;
      foodByDate.set(f.date, cur);
    }

    const days: Array<{
      date: string;
      avg7: number | null;
      avg30: number | null;
      calories: number;
      protein: number;
    }> = [];

    for (let i = nutritionWindowDays - 1; i >= 0; i--) {
      const key = offsetDateKey(todayKey, -i);
      const w7Vals: number[] = [];
      for (let j = 0; j < 7; j++) {
        const val = weightMap.get(offsetDateKey(key, -j));
        if (val !== undefined) w7Vals.push(val);
      }
      const w30Vals: number[] = [];
      for (let j = 0; j < 30; j++) {
        const val = weightMap.get(offsetDateKey(key, -j));
        if (val !== undefined) w30Vals.push(val);
      }
      const fSummary = foodByDate.get(key) ?? { calories: 0, protein: 0 };
      days.push({
        date: key.slice(5),
        avg7:
          w7Vals.length > 0
            ? displayWeight(w7Vals.reduce((a, b) => a + b, 0) / w7Vals.length, unit, 2)
            : null,
        avg30:
          w30Vals.length > 0
            ? displayWeight(w30Vals.reduce((a, b) => a + b, 0) / w30Vals.length, unit, 2)
            : null,
        calories: Math.round(fSummary.calories),
        protein: Math.round(fSummary.protein),
      });
    }
    return days;
  }, [weightLogs, foodLogs, nutritionWindowDays, todayKey, unit]);

  if (!profile) return null;

  const latestWeightKg = weightLogs[weightLogs.length - 1]?.weightKg ?? profile.weightKg;
  const startWeightKg = weightLogs[0]?.weightKg ?? latestWeightKg;
  const last7AvgKg = (() => {
    const vals = weightLogs.slice(-7).map((w) => w.weightKg);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : latestWeightKg;
  })();
  const totalWeightChangeDisplay =
    Math.round((displayWeight(latestWeightKg, unit, 1) - displayWeight(startWeightKg, unit, 1)) * 10) / 10;

  const latestMeas = measurements[measurements.length - 1];
  const firstMeas = measurements[0];

  const posePhotos = photos.filter((p) => p.pose === comparePose);
  const leftPhoto = posePhotos.find((p) => p.id === compareLeftId) ?? posePhotos[posePhotos.length - 1];
  const rightPhoto = posePhotos.find((p) => p.id === compareRightId) ?? posePhotos[0];
  const blurPhotos = profile.privacyBlurPhotos && !revealPhotos;

  async function handleLogWeight(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(weightInput);
    if (!Number.isFinite(val) || val < 25 || val > 500) return;
    const kg = Math.round(inputToKg(val, unit) * 10) / 10;
    const entry = { id: `wt-${todayKey}`, date: todayKey, weightKg: kg };
    await db.weightLogs.put(entry);
    await db.profile.update(DEFAULT_PROFILE_ID, { weightKg: kg });
    await enqueueSyncMutation('weightLog', entry.id, 'upsert', entry);
    setWeightInput('');
    showToast(`Logged weight ${displayWeight(kg, unit, 1)} ${wUnit}`, 'success');
  }

  async function handleSaveMeasurements(e: React.FormEvent) {
    e.preventDefault();
    const entry: BodyMeasurementEntry = {
      id: `meas-${todayKey}`,
      date: todayKey,
    };
    for (const f of MEASUREMENT_FIELDS) {
      const raw = parseFloat(measForm[f.key] ?? '');
      if (Number.isFinite(raw) && raw > 0) {
        (entry as unknown as Record<string, number>)[f.key] = Math.round(inputToCm(raw, unit) * 10) / 10;
      }
    }
    if (customMeasName.trim() && Number.isFinite(parseFloat(customMeasVal))) {
      entry.custom = {
        [customMeasName.trim()]: Math.round(inputToCm(parseFloat(customMeasVal), unit) * 10) / 10,
      };
    }
    await db.measurements.put(entry);
    await enqueueSyncMutation('measurement', entry.id, 'upsert', entry);
    setMeasModalOpen(false);
    setMeasForm({});
    setCustomMeasName('');
    setCustomMeasVal('');
    showToast('Saved body measurements', 'success');
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const entry: ProgressPhotoEntry = {
        id: `photo-${Date.now()}`,
        date: todayKey,
        pose: photoPose,
        dataUrl,
        weightKg: latestWeightKg,
        note: photoNote.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      await db.progressPhotos.put(entry);
      await enqueueSyncMutation('progressPhoto', entry.id, 'upsert', entry);
      setPhotoNote('');
      showToast(`Saved ${photoPose} progress photo privately`, 'success');
    } catch {
      showToast('Failed to process image', 'danger');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      <Tabs
        value={subTab}
        onChange={setSubTab}
        options={[
          { id: 'charts', label: 'Body & Lifts' },
          { id: 'measurements', label: 'Measurements', count: measurements.length },
          { id: 'photos', label: 'Photos', count: photos.length },
        ]}
      />

      {subTab === 'charts' && (
        <div className="space-y-4">
          {/* Body Weight Overview + Quick Entry */}
          <Card>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard
                label="7d Avg Weight"
                value={displayWeight(last7AvgKg, unit, 1)}
                unit={wUnit}
                accent="lime"
              />
              <MetricCard
                label="Goal Weight"
                value={displayWeight(profile.goalWeightKg ?? profile.weightKg, unit, 1)}
                unit={wUnit}
                accent="info"
              />
              <MetricCard
                label="Total Change"
                value={`${totalWeightChangeDisplay > 0 ? '+' : ''}${totalWeightChangeDisplay}`}
                unit={wUnit}
                accent="success"
              />
            </div>

            <form onSubmit={handleLogWeight} className="mt-3 flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder={`Today's weight (${displayWeight(latestWeightKg, unit, 1)} ${wUnit})`}
                className="min-h-[44px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-3 text-sm text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
              />
              <Button type="submit">Log {wUnit}</Button>
            </form>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Strength Progress Chart */}
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-[#B7F36B]" />
                <div>
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Strength Progress</h2>
                  <p className="text-xs text-[#A1AAA3]">Estimated 1RM &amp; Top Weight ({wUnit})</p>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-2">
                <select
                  value={activeExerciseId}
                  onChange={(e) => setSelectedExerciseId(e.target.value)}
                  aria-label="Select exercise for strength chart"
                  className="min-h-[40px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-2.5 text-xs font-medium text-[#F3F5F2] focus:border-[#B7F36B] focus:outline-none"
                >
                  {loggedExerciseOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>

                <div className="flex rounded-xl border border-[#303832] bg-[#171A18] p-0.5">
                  <button
                    type="button"
                    onClick={() => setLiftMetric('est1RM')}
                    className={`min-h-[34px] rounded-lg px-2.5 text-[11px] font-semibold ${
                      liftMetric === 'est1RM' ? 'bg-[#B7F36B] text-[#101211]' : 'text-[#A1AAA3]'
                    }`}
                  >
                    1RM
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiftMetric('topWeight')}
                    className={`min-h-[34px] rounded-lg px-2.5 text-[11px] font-semibold ${
                      liftMetric === 'topWeight' ? 'bg-[#79B8F5] text-[#101211]' : 'text-[#A1AAA3]'
                    }`}
                  >
                    Top {wUnit}
                  </button>
                </div>
              </div>

              {liftChartData.length > 0 ? (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={liftChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#252B28" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" stroke="#727B74" fontSize={10} tickLine={false} />
                      <YAxis
                        stroke="#727B74"
                        fontSize={10}
                        tickLine={false}
                        domain={['dataMin - 5', 'dataMax + 5']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#171A18',
                          border: '1px solid #303832',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey={liftMetric}
                        name={liftMetric === 'est1RM' ? `Est. 1RM (${wUnit})` : `Top Weight (${wUnit})`}
                        stroke={liftMetric === 'est1RM' ? '#B7F36B' : '#79B8F5'}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: liftMetric === 'est1RM' ? '#B7F36B' : '#79B8F5' }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-xs text-[#727B74]">
                  Log working sets for this exercise to chart strength progress.
                </p>
              )}
            </Card>

            {/* Muscle Group Volume */}
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#79B8F5]" />
                  <div>
                    <h2 className="text-sm font-bold text-[#F3F5F2]">Muscle Group Volume</h2>
                    <p className="text-xs text-[#A1AAA3]">Completed working sets</p>
                  </div>
                </div>
                <div className="flex rounded-xl border border-[#303832] bg-[#171A18] p-0.5">
                  {([7, 28] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setVolumeWindowDays(d)}
                      className={`min-h-[32px] rounded-lg px-2.5 text-[11px] font-semibold ${
                        volumeWindowDays === d ? 'bg-[#79B8F5] text-[#101211]' : 'text-[#A1AAA3]'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={muscleVolumeData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="#252B28" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="muscle" stroke="#727B74" fontSize={10} tickLine={false} />
                    <YAxis stroke="#727B74" fontSize={10} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#171A18',
                        border: '1px solid #303832',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="sets"
                      name="Working Sets"
                      fill="#79B8F5"
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Weight & Calorie Adherence */}
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-[#B7F36B]" />
                <div>
                  <h2 className="text-sm font-bold text-[#F3F5F2]">Weight Trend &amp; Calorie Intake</h2>
                  <p className="text-xs text-[#A1AAA3]">7d / 30d rolling weight ({wUnit}) vs. kcal</p>
                </div>
              </div>
              <div className="flex rounded-xl border border-[#303832] bg-[#171A18] p-0.5">
                {([14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNutritionWindowDays(d)}
                    className={`min-h-[32px] rounded-lg px-2.5 text-[11px] font-semibold ${
                      nutritionWindowDays === d ? 'bg-[#B7F36B] text-[#101211]' : 'text-[#A1AAA3]'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={nutritionWeightData} margin={{ top: 8, right: -8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#252B28" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="#727B74" fontSize={10} tickLine={false} />
                  <YAxis yAxisId="kcal" orientation="left" stroke="#727B74" fontSize={10} tickLine={false} />
                  <YAxis
                    yAxisId="wt"
                    orientation="right"
                    stroke="#B7F36B"
                    fontSize={10}
                    tickLine={false}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171A18',
                      border: '1px solid #303832',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    yAxisId="kcal"
                    dataKey="calories"
                    name="Calories (kcal)"
                    fill="#252B27"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="wt"
                    type="monotone"
                    dataKey="avg7"
                    name={`7d Avg (${wUnit})`}
                    stroke="#B7F36B"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: '#B7F36B' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="wt"
                    type="monotone"
                    dataKey="avg30"
                    name={`30d Avg (${wUnit})`}
                    stroke="#EAB765"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Goal Milestones */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[#EAB765]" />
              <h2 className="text-sm font-bold text-[#F3F5F2]">Goal Milestones</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[#A1AAA3]">Logged Workouts Milestone</span>
                  <span className="tabular-nums font-semibold text-[#F3F5F2]">{sessions.length} / 25</span>
                </div>
                <ProgressBar value={sessions.length} max={25} tone="lime" />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[#A1AAA3]">Weight Goal Proximity</span>
                  <span className="tabular-nums font-semibold text-[#F3F5F2]">
                    {displayWeight(latestWeightKg, unit, 1)} / {displayWeight(profile.goalWeightKg ?? profile.weightKg, unit, 1)} {wUnit}
                  </span>
                </div>
                <ProgressBar
                  value={Math.max(0, 100 - Math.abs(latestWeightKg - (profile.goalWeightKg ?? latestWeightKg)) * 15)}
                  max={100}
                  tone="success"
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {subTab === 'measurements' && (
        <div className="space-y-4">
          <Button className="w-full" onClick={() => setMeasModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Log Body Measurements
          </Button>

          {latestMeas ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {MEASUREMENT_FIELDS.map((f) => {
                const curCm = latestMeas[f.key] as number | undefined;
                if (curCm === undefined) return null;
                const firstCm = (firstMeas?.[f.key] as number | undefined) ?? curCm;
                const delta =
                  Math.round((displayLength(curCm, unit, 1) - displayLength(firstCm, unit, 1)) * 10) / 10;

                return (
                  <MetricCard
                    key={f.key}
                    label={f.label}
                    value={displayLength(curCm, unit, 1)}
                    unit={lUnit}
                    sublabel={`${delta > 0 ? `+${delta}` : delta} ${lUnit} vs start`}
                    accent="lime"
                  />
                );
              })}
              {latestMeas.custom &&
                Object.entries(latestMeas.custom).map(([k, v]) => (
                  <MetricCard
                    key={k}
                    label={k}
                    value={displayLength(v, unit, 1)}
                    unit={lUnit}
                    accent="info"
                  />
                ))}
            </div>
          ) : (
            <EmptyState
              icon={<Ruler className="h-6 w-6" />}
              title="No Measurements Logged"
              description="Track waist, chest, arms, shoulders, and thighs over time."
            />
          )}
        </div>
      )}

      {subTab === 'photos' && (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#F3F5F2]">Private Progress Photos</h2>
                <p className="text-xs text-[#A1AAA3]">Stored locally on your device only</p>
              </div>
              {profile.privacyBlurPhotos && (
                <Button size="sm" variant="secondary" onClick={() => setRevealPhotos((r) => !r)}>
                  {revealPhotos ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {revealPhotos ? 'Hide' : 'Reveal'}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['front', 'side', 'back'] as const).map((pose) => (
                <button
                  key={pose}
                  type="button"
                  onClick={() => setPhotoPose(pose)}
                  className={`min-h-[40px] rounded-xl text-xs font-semibold capitalize ${
                    photoPose === pose
                      ? 'bg-[#B7F36B] text-[#101211]'
                      : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                  }`}
                >
                  {pose}
                </button>
              ))}
            </div>

            <div className="mt-2.5 flex gap-2">
              <input
                type="text"
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                placeholder="Optional note (e.g. Morning fasted)"
                className="min-h-[44px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-3 text-xs text-[#F3F5F2]"
              />
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-2xl bg-[#B7F36B] px-4 text-xs font-bold text-[#101211]">
                <Camera className="h-4 w-4" />
                Add Photo
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>
          </Card>

          {/* Date-based Comparison */}
          {posePhotos.length >= 2 && leftPhoto && rightPhoto && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#F3F5F2]">Side-by-Side Comparison</h3>
                <Select
                  value={comparePose}
                  onChange={(e) => {
                    setComparePose(e.target.value as PhotoPose);
                    setCompareLeftId('');
                    setCompareRightId('');
                  }}
                  className="!w-24 !min-h-[36px] text-xs"
                >
                  <option value="front">Front</option>
                  <option value="side">Side</option>
                  <option value="back">Back</option>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <select
                    value={leftPhoto.id}
                    onChange={(e) => setCompareLeftId(e.target.value)}
                    className="mb-1.5 min-h-[36px] w-full rounded-xl border border-[#303832] bg-[#171A18] px-2 text-xs text-[#F3F5F2]"
                  >
                    {posePhotos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.date} ({p.weightKg ? `${displayWeight(p.weightKg, unit, 1)}${wUnit}` : ''})
                      </option>
                    ))}
                  </select>
                  <img
                    src={leftPhoto.dataUrl}
                    alt={`${leftPhoto.pose} on ${leftPhoto.date}`}
                    className={`aspect-[3/4] w-full rounded-2xl object-cover ${
                      blurPhotos ? 'blur-md' : ''
                    }`}
                  />
                </div>
                <div>
                  <select
                    value={rightPhoto.id}
                    onChange={(e) => setCompareRightId(e.target.value)}
                    className="mb-1.5 min-h-[36px] w-full rounded-xl border border-[#303832] bg-[#171A18] px-2 text-xs text-[#F3F5F2]"
                  >
                    {posePhotos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.date} ({p.weightKg ? `${displayWeight(p.weightKg, unit, 1)}${wUnit}` : ''})
                      </option>
                    ))}
                  </select>
                  <img
                    src={rightPhoto.dataUrl}
                    alt={`${rightPhoto.pose} on ${rightPhoto.date}`}
                    className={`aspect-[3/4] w-full rounded-2xl object-cover ${
                      blurPhotos ? 'blur-md' : ''
                    }`}
                  />
                </div>
              </div>
            </Card>
          )}

          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {photos.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-2xl border border-[#252B28] bg-[#1D221F]">
                  <img
                    src={p.dataUrl}
                    alt={`${p.pose} ${p.date}`}
                    className={`aspect-[3/4] w-full object-cover ${blurPhotos ? 'blur-md' : ''}`}
                  />
                  <div className="flex items-center justify-between p-2">
                    <div>
                      <Badge tone="lime">{p.pose}</Badge>
                      <p className="mt-1 text-[11px] text-[#A1AAA3]">{p.date}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await db.progressPhotos.delete(p.id);
                        await enqueueSyncMutation('progressPhoto', p.id, 'delete');
                        showToast('Deleted progress photo', 'info');
                      }}
                      aria-label="Delete photo"
                      className="text-[#727B74] hover:text-[#E87979]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Camera className="h-6 w-6" />}
              title="No Progress Photos Yet"
              description="Upload front, side, or back check-in photos. Stored strictly locally in IndexedDB."
            />
          )}
        </div>
      )}

      {/* Measurements Entry Modal */}
      <ModalShell
        isOpen={measModalOpen}
        title="Log Measurements"
        subtitle={`Units: ${lUnit}`}
        variant="sheet"
        onClose={() => setMeasModalOpen(false)}
      >
        <form onSubmit={handleSaveMeasurements} className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            {MEASUREMENT_FIELDS.map((f) => (
              <Input
                key={f.key}
                label={`${f.label} (${lUnit})`}
                inputMode="decimal"
                value={measForm[f.key] ?? ''}
                onChange={(e) => setMeasForm((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={
                  latestMeas?.[f.key]
                    ? String(displayLength(latestMeas[f.key] as number, unit, 1))
                    : '—'
                }
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-t border-[#252B28] pt-3">
            <Input
              label="Custom Name"
              value={customMeasName}
              onChange={(e) => setCustomMeasName(e.target.value)}
              placeholder="e.g. Right Bicep"
            />
            <Input
              label={`Value (${lUnit})`}
              inputMode="decimal"
              value={customMeasVal}
              onChange={(e) => setCustomMeasVal(e.target.value)}
              placeholder="38.0"
            />
          </div>

          <Button type="submit" className="w-full" size="lg">
            Save Measurements
          </Button>
        </form>
      </ModalShell>
    </div>
  );
}
