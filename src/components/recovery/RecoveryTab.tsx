import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Footprints, HeartPulse, Moon, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { calculateRecoverySummary } from '../../services/recoveryCalc';
import { enqueueSyncMutation } from '../../services/syncService';
import { offsetDateKey, toLocalDateKey } from '../../services/workoutMetrics';
import type { RecoveryLogEntry } from '../../types';
import { Badge, Button, Card, Input, MetricCard, ProgressBar } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

const HABITS = [
  { id: 'creatine', label: 'Creatine 5g' },
  { id: 'electrolytes', label: 'Electrolytes' },
  { id: 'mobility', label: '10m Mobility' },
  { id: 'sunlight', label: 'Morning Sunlight' },
];

export function RecoveryTab() {
  const [todayKey] = useState(() => toLocalDateKey(new Date()));
  const { showToast } = useToast();

  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const recoveryLogs = useLiveQuery(() => db.recoveryLogs.orderBy('date').toArray(), [], []);
  const todayWaters = useLiveQuery(
    () => db.waterLogs.where('date').equals(todayKey).toArray(),
    [todayKey],
    []
  );
  const sessions = useLiveQuery(() => db.workoutSessions.toArray(), [], []);

  const todayRec = recoveryLogs.find((r) => r.date === todayKey);

  const [sleepHours, setSleepHours] = useState<string>('');
  const [sleepQuality, setSleepQuality] = useState<number>(4);
  const [steps, setSteps] = useState<string>('');
  const [activeMinutes, setActiveMinutes] = useState<string>('');
  const [fatigue, setFatigue] = useState<number>(2);
  const [soreness, setSoreness] = useState<number>(2);
  const [stress, setStress] = useState<number>(2);
  const [mood, setMood] = useState<number>(4);
  const [habits, setHabits] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');

  if (!profile) return null;

  const waterMl = todayWaters.reduce((s, w) => s + w.amountMl, 0);
  const effectiveEntry: RecoveryLogEntry = {
    id: `rec-${todayKey}`,
    date: todayKey,
    sleepHours: sleepHours !== '' ? parseFloat(sleepHours) || 7.5 : todayRec?.sleepHours ?? 7.5,
    sleepQuality: todayRec?.sleepQuality ?? sleepQuality,
    steps: steps !== '' ? parseInt(steps, 10) || 0 : todayRec?.steps ?? 8000,
    activeMinutes: activeMinutes !== '' ? parseInt(activeMinutes, 10) || 0 : todayRec?.activeMinutes ?? 45,
    fatigue: todayRec?.fatigue ?? fatigue,
    soreness: todayRec?.soreness ?? soreness,
    stress: todayRec?.stress ?? stress,
    mood: todayRec?.mood ?? mood,
    habits: Object.keys(habits).length > 0 ? habits : todayRec?.habits ?? {},
    note: note || todayRec?.note,
  };

  const sevenAgo = offsetDateKey(todayKey, -7);
  const summary = calculateRecoverySummary(
    effectiveEntry,
    profile.sleepGoalHours ?? 7.5,
    waterMl,
    profile.waterGoalMl,
    sessions.filter((s) => s.startedAt.slice(0, 10) >= sevenAgo)
  );

  const last7Rec = recoveryLogs.slice(-7);
  const avgSleep7 = last7Rec.length
    ? (last7Rec.reduce((s, r) => s + r.sleepHours, 0) / last7Rec.length).toFixed(1)
    : '—';
  const avgSteps7 = last7Rec.length
    ? Math.round(last7Rec.reduce((s, r) => s + r.steps, 0) / last7Rec.length)
    : 0;

  async function handleSaveRecovery(e: React.FormEvent) {
    e.preventDefault();
    const payload: RecoveryLogEntry = {
      id: `rec-${todayKey}`,
      date: todayKey,
      sleepHours: Math.max(0, Math.min(18, parseFloat(sleepHours || String(todayRec?.sleepHours ?? 7.5)) || 7.5)),
      sleepQuality,
      steps: Math.max(0, parseInt(steps || String(todayRec?.steps ?? 8000), 10) || 0),
      activeMinutes: Math.max(0, parseInt(activeMinutes || String(todayRec?.activeMinutes ?? 45), 10) || 0),
      fatigue,
      soreness,
      stress,
      mood,
      habits: Object.keys(habits).length > 0 ? habits : todayRec?.habits ?? {},
      note: note.trim() || undefined,
    };

    await db.recoveryLogs.put(payload);
    await enqueueSyncMutation('recoveryLog', payload.id, 'upsert', payload);
    showToast('Recovery & health check-in saved', 'success');
  }

  function renderScaleRow(
    label: string,
    val: number,
    onChange: (n: number) => void,
    lowLabel: string,
    highLabel: string
  ) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[#F3F5F2]">{label}</span>
          <span className="text-[11px] text-[#727B74]">
            {lowLabel} → {highLabel}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`min-h-[38px] rounded-xl text-xs font-bold transition ${
                val === n
                  ? 'bg-[#B7F36B] text-[#101211]'
                  : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Recovery Readiness Banner */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B7F36B]/15 text-[#B7F36B]">
              <HeartPulse className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#F3F5F2]">Readiness {summary.score}/100</h2>
                <Badge tone={summary.tone}>{summary.status}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-[#A1AAA3]">{summary.recommendation}</p>
            </div>
          </div>
        </div>
        <ProgressBar value={summary.score} max={100} tone={summary.tone} height="md" className="mt-3" />
      </Card>

      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard
          label="7d Avg Sleep"
          value={avgSleep7}
          unit="hrs"
          icon={<Moon className="h-3.5 w-3.5 text-[#79B8F5]" />}
          accent="info"
        />
        <MetricCard
          label="7d Avg Steps"
          value={avgSteps7.toLocaleString()}
          icon={<Footprints className="h-3.5 w-3.5 text-[#B7F36B]" />}
          accent="lime"
        />
      </div>

      {/* Daily Check-In Form */}
      <Card>
        <form onSubmit={handleSaveRecovery} className="space-y-4">
          <h3 className="text-sm font-bold text-[#F3F5F2]">Daily Recovery &amp; Habits</h3>

          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Sleep (hrs)"
              inputMode="decimal"
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              placeholder={String(todayRec?.sleepHours ?? 7.5)}
            />
            <Input
              label="Steps"
              inputMode="numeric"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={String(todayRec?.steps ?? 8000)}
            />
            <Input
              label="Active Min"
              inputMode="numeric"
              value={activeMinutes}
              onChange={(e) => setActiveMinutes(e.target.value)}
              placeholder={String(todayRec?.activeMinutes ?? 45)}
            />
          </div>

          {renderScaleRow('Sleep Quality', sleepQuality, setSleepQuality, 'Poor', 'Deep')}
          {renderScaleRow('Fatigue', fatigue, setFatigue, 'Fresh', 'Exhausted')}
          {renderScaleRow('Muscle Soreness', soreness, setSoreness, 'None', 'Very Sore')}
          {renderScaleRow('Stress', stress, setStress, 'Calm', 'High')}
          {renderScaleRow('Mood', mood, setMood, 'Low', 'Great')}

          <div>
            <span className="mb-2 block text-xs font-medium text-[#A1AAA3]">Daily Habits</span>
            <div className="grid grid-cols-2 gap-2">
              {HABITS.map((h) => {
                const checked = habits[h.id] ?? todayRec?.habits?.[h.id] ?? false;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setHabits((p) => ({ ...p, [h.id]: !checked }))}
                    className={`flex min-h-[42px] items-center justify-between rounded-xl border px-3 text-xs font-semibold transition ${
                      checked
                        ? 'border-[#B7F36B]/40 bg-[#B7F36B]/15 text-[#B7F36B]'
                        : 'border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                    }`}
                  >
                    <span>{h.label}</span>
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="Recovery Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Slight hamstring tightness after RDLs"
          />

          <Button type="submit" className="w-full" size="lg">
            <Sparkles className="h-4 w-4" />
            Save Today&apos;s Check-In
          </Button>
        </form>
      </Card>
    </div>
  );
}
