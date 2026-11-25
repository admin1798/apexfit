import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, FileBarChart2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { displayLength, displayWeight, lengthLabel, weightLabel } from '../../services/units';
import { offsetDateKey, toLocalDateKey } from '../../services/workoutMetrics';
import { Badge, Card, MetricCard, Tabs } from '../ui/primitives';

export function ReportsTab() {
  const [todayKey] = useState(() => toLocalDateKey(new Date()));
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');

  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const sessions = useLiveQuery(() => db.workoutSessions.toArray(), [], []);
  const foodLogs = useLiveQuery(() => db.foodLogs.toArray(), [], []);
  const weightLogs = useLiveQuery(() => db.weightLogs.orderBy('date').toArray(), [], []);
  const recoveryLogs = useLiveQuery(() => db.recoveryLogs.orderBy('date').toArray(), [], []);
  const measurements = useLiveQuery(() => db.measurements.orderBy('date').toArray(), [], []);

  const daysBack = period === 'weekly' ? 7 : 30;
  const startKey = offsetDateKey(todayKey, -(daysBack - 1));

  const report = useMemo(() => {
    const periodSessions = sessions.filter((s) => s.startedAt.slice(0, 10) >= startKey);
    const totalVolumeKg = periodSessions.reduce((s, x) => s + x.totalVolumeKg, 0);
    const prHits = periodSessions.reduce(
      (sum, s) =>
        sum +
        s.exercises.reduce(
          (es, ex) => es + ex.sets.filter((st) => st.isPR1RM || st.isPRWeight).length,
          0
        ),
      0
    );

    const periodFoods = foodLogs.filter((f) => f.date >= startKey);
    const daysWithFood = new Set(periodFoods.map((f) => f.date)).size;
    const avgCalories = daysWithFood
      ? Math.round(periodFoods.reduce((s, f) => s + f.calories, 0) / daysWithFood)
      : 0;
    const avgProtein = daysWithFood
      ? Math.round(periodFoods.reduce((s, f) => s + f.protein, 0) / daysWithFood)
      : 0;

    const periodWeights = weightLogs.filter((w) => w.date >= startKey);
    const weightDeltaKg =
      periodWeights.length >= 2
        ? Math.round((periodWeights[periodWeights.length - 1].weightKg - periodWeights[0].weightKg) * 10) / 10
        : 0;

    const periodRecovery = recoveryLogs.filter((r) => r.date >= startKey);
    const avgSleep = periodRecovery.length
      ? Number((periodRecovery.reduce((s, r) => s + r.sleepHours, 0) / periodRecovery.length).toFixed(1))
      : 0;
    const avgSteps = periodRecovery.length
      ? Math.round(periodRecovery.reduce((s, r) => s + r.steps, 0) / periodRecovery.length)
      : 0;

    const latestMeas = measurements[measurements.length - 1];
    const baselineMeas = measurements.find((m) => m.date >= startKey) ?? measurements[0];
    const waistDeltaCm =
      latestMeas?.waistCm && baselineMeas?.waistCm
        ? Math.round((latestMeas.waistCm - baselineMeas.waistCm) * 10) / 10
        : 0;

    return {
      workoutsCount: periodSessions.length,
      totalVolumeKg,
      prHits,
      daysWithFood,
      avgCalories,
      avgProtein,
      weightDeltaKg,
      avgSleep,
      avgSteps,
      waistDeltaCm,
    };
  }, [sessions, foodLogs, weightLogs, recoveryLogs, measurements, startKey]);

  if (!profile) return null;

  const unit = profile.unitSystem ?? 'metric';
  const wUnit = weightLabel(unit);
  const lUnit = lengthLabel(unit);

  const expectedWorkouts = Math.round(((profile.trainingDaysPerWeek ?? 5) * daysBack) / 7);
  const workoutConsistencyPct = Math.min(
    100,
    Math.round((report.workoutsCount / Math.max(1, expectedWorkouts)) * 100)
  );

  const observations: string[] = [];
  if (report.workoutsCount > 0) {
    observations.push(
      `Completed ${report.workoutsCount} of ${expectedWorkouts} planned workouts (${workoutConsistencyPct}% adherence) totaling ${displayWeight(report.totalVolumeKg, unit, 0).toLocaleString()} ${wUnit}.`
    );
  } else {
    observations.push('No workouts recorded in this window yet — start a routine to build trend data.');
  }

  if (report.daysWithFood > 0) {
    const protGap = report.avgProtein - profile.proteinTarget;
    observations.push(
      `Averaged ${report.avgCalories.toLocaleString()} kcal & ${report.avgProtein}g protein/day across ${report.daysWithFood} logged days (${protGap >= 0 ? `+${protGap}g above` : `${Math.abs(protGap)}g below`} target).`
    );
  }

  if (report.avgSleep > 0) {
    observations.push(
      `Sleep averaged ${report.avgSleep} hrs/night with ${report.avgSteps.toLocaleString()} daily steps.`
    );
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      <Tabs
        value={period}
        onChange={setPeriod}
        options={[
          { id: 'weekly', label: 'Weekly Report (7d)' },
          { id: 'monthly', label: 'Monthly Report (30d)' },
        ]}
      />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileBarChart2 className="h-4 w-4 text-[#B7F36B]" />
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F2]">
                {period === 'weekly' ? '7-Day Performance Report' : '30-Day Performance Report'}
              </h2>
              <p className="text-xs text-[#A1AAA3]">
                {startKey} → {todayKey}
              </p>
            </div>
          </div>
          <Badge tone={workoutConsistencyPct >= 80 ? 'lime' : 'warning'}>
            {workoutConsistencyPct}% Consistency
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <MetricCard label="Workouts" value={report.workoutsCount} sublabel={`Target ${expectedWorkouts}`} accent="lime" />
          <MetricCard
            label="Total Volume"
            value={displayWeight(report.totalVolumeKg, unit, 0).toLocaleString()}
            unit={wUnit}
            accent="info"
          />
          <MetricCard label="PRs Hit" value={report.prHits} icon={<Trophy className="h-3.5 w-3.5 text-[#B7F36B]" />} accent="warning" />
          <MetricCard label="Avg Calories" value={report.avgCalories || '—'} unit={report.avgCalories ? 'kcal' : undefined} />
          <MetricCard label="Avg Protein" value={report.avgProtein || '—'} unit={report.avgProtein ? 'g' : undefined} accent="success" />
          <MetricCard
            label="Weight Change"
            value={`${report.weightDeltaKg > 0 ? '+' : ''}${displayWeight(report.weightDeltaKg, unit, 1)}`}
            unit={wUnit}
          />
          <MetricCard label="Avg Sleep" value={report.avgSleep || '—'} unit={report.avgSleep ? 'hrs' : undefined} accent="info" />
          <MetricCard label="Avg Steps" value={report.avgSteps ? report.avgSteps.toLocaleString() : '—'} />
          <MetricCard
            label="Waist Delta"
            value={`${report.waistDeltaCm > 0 ? '+' : ''}${displayLength(report.waistDeltaCm, unit, 1)}`}
            unit={lUnit}
          />
        </div>
      </Card>

      <Card>
        <h3 className="mb-2.5 text-sm font-bold text-[#F3F5F2]">Actionable Observations</h3>
        <div className="space-y-2">
          {observations.map((obs, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-2xl bg-[#171A18] p-3 text-xs leading-relaxed text-[#A1AAA3]"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#B7F36B]" />
              <span>{obs}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
