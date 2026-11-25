import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { displayWeight, weightLabel } from '../units';
import { offsetDateKey, toLocalDateKey } from '../workoutMetrics';
import {
  calculateWeightTrend,
  getBodyMeasurements,
  getCalorieTotals,
  getPersonalRecords,
  getProteinTotals,
  getRecoverySummaryTool,
  getSleepHistory,
  getStepsAndActivity,
  getWeeklyTrainingVolume,
  type ToolAuthContext,
} from './tools';

export async function generateWeeklyFitnessAnalystReport(auth: ToolAuthContext): Promise<string> {
  const todayKey = toLocalDateKey(new Date());
  const weekStart = offsetDateKey(todayKey, -6);

  const [
    profile,
    weeklyVol,
    prs,
    cal7,
    prot7,
    weightTrend,
    measurements,
    sleep7,
    steps7,
    recovery,
  ] = await Promise.all([
    db.profile.get(DEFAULT_PROFILE_ID),
    getWeeklyTrainingVolume(auth, 7),
    getPersonalRecords(auth),
    getCalorieTotals(auth, 7),
    getProteinTotals(auth, 7),
    calculateWeightTrend(auth),
    getBodyMeasurements(auth),
    getSleepHistory(auth, 7),
    getStepsAndActivity(auth, 7),
    getRecoverySummaryTool(auth),
  ]);

  const unit = profile?.unitSystem ?? 'metric';
  const wUnit = weightLabel(unit);
  const targetWorkouts = profile?.trainingDaysPerWeek ?? 5;
  const consistencyPct = Math.min(100, Math.round((weeklyVol.workoutsCount / Math.max(1, targetWorkouts)) * 100));
  const weekPRs = prs.filter((p) => p.date >= weekStart);

  const avgSleep = sleep7.length
    ? (sleep7.reduce((s, x) => s + x.sleepHours, 0) / sleep7.length).toFixed(1)
    : null;
  const avgSteps = steps7.length
    ? Math.round(steps7.reduce((s, x) => s + x.steps, 0) / steps7.length)
    : null;

  const calAdherence = profile && cal7.loggedDays > 0
    ? Math.round((cal7.avgCalories / Math.max(1, profile.calorieTarget)) * 100)
    : null;
  const protAdherence = profile && prot7.loggedDays > 0
    ? Math.round((prot7.avgProteinG / Math.max(1, profile.proteinTarget)) * 100)
    : null;

  const well: string[] = [];
  const improve: string[] = [];
  const priorities: string[] = [];

  if (consistencyPct >= 80) {
    well.push(`Strong training consistency (${weeklyVol.workoutsCount}/${targetWorkouts} sessions, ${consistencyPct}%).`);
  } else {
    improve.push(`Training frequency was ${weeklyVol.workoutsCount}/${targetWorkouts} planned sessions.`);
    priorities.push(`Lock in ${targetWorkouts} scheduled sessions next week.`);
  }

  if (weekPRs.length > 0) {
    well.push(`Hit ${weekPRs.length} personal record(s) (e.g. ${weekPRs[0].exerciseName} at ${displayWeight(weekPRs[0].weightKg, unit, 1)}${wUnit} × ${weekPRs[0].reps}).`);
  }

  if (protAdherence !== null && protAdherence >= 90) {
    well.push(`Protein adherence averaged ${prot7.avgProteinG}g/day (${protAdherence}% of target).`);
  } else if (protAdherence !== null) {
    improve.push(`Average protein (${prot7.avgProteinG}g) trailed your ${profile?.proteinTarget}g target.`);
    priorities.push(`Add 1 high-protein anchor daily (e.g. 150g chicken/paneer, rohu fish, or 1 whey scoop) to clear ${profile?.proteinTarget}g.`);
  } else {
    improve.push('Insufficient nutrition logs over the past 7 days to evaluate calorie/protein adherence.');
    priorities.push('Log at least 5 of 7 days of meals next week for accurate macro feedback.');
  }

  if (weeklyVol.undertrained.length > 0) {
    improve.push(`Lower weekly set volume (<6 sets) for: ${weeklyVol.undertrained.join(', ')}.`);
    priorities.push(`Add 2–3 direct working sets for ${weeklyVol.undertrained[0]} next week.`);
  }

  if (avgSleep !== null && Number(avgSleep) < (profile?.sleepGoalHours ?? 7.5) - 0.5) {
    improve.push(`Sleep averaged ${avgSleep} hrs (below ${profile?.sleepGoalHours ?? 7.5} hr target).`);
    priorities.push(`Protect an extra 30–45 min sleep window on training nights.`);
  }

  if (priorities.length === 0) {
    priorities.push(
      'Maintain double progression on primary compound lifts',
      'Keep protein within ±10g of daily target',
      'Maintain 7.5+ hrs sleep and daily hydration'
    );
  }

  const latestMeas = measurements[measurements.length - 1];
  const prevMeas = measurements.length >= 2 ? measurements[0] : null;
  const waistNote =
    latestMeas?.waistCm && prevMeas?.waistCm
      ? `Waist: ${latestMeas.waistCm}cm (${latestMeas.waistCm - prevMeas.waistCm > 0 ? '+' : ''}${Math.round((latestMeas.waistCm - prevMeas.waistCm) * 10) / 10}cm vs earliest)`
      : 'Waist measurement trend unavailable (fewer than 2 entries).';

  const mainProblem = improve[0] ?? 'No major bottlenecks detected — stay consistent with progressive overload.';

  return `### Weekly Fitness Analyst (${weekStart} → ${todayKey})

**Training**
• Workouts: **${weeklyVol.workoutsCount}/${targetWorkouts}** (${consistencyPct}% consistency) • **${weeklyVol.totalWorkingSets} working sets** • **${displayWeight(weeklyVol.totalVolumeKg, unit, 0).toLocaleString()} ${wUnit}** volume
• Muscle split: ${Object.entries(weeklyVol.setsByMuscle).map(([m, s]) => `${m} ${s}`).join(' | ')}
• PRs this week: **${weekPRs.length}**

**Nutrition (${cal7.loggedDays}/7 days logged)**
• Avg Calories: **${cal7.loggedDays ? `${cal7.avgCalories} kcal` : 'Insufficient data'}**${calAdherence !== null ? ` (${calAdherence}% of ${profile?.calorieTarget} kcal)` : ''}
• Avg Protein: **${prot7.loggedDays ? `${prot7.avgProteinG}g` : 'Insufficient data'}**${protAdherence !== null ? ` (${protAdherence}% of ${profile?.proteinTarget}g)` : ''}

**Body Progress**
• 7d Rolling Weight: **${weightTrend.avg7Kg !== null ? `${displayWeight(weightTrend.avg7Kg, unit, 1)} ${wUnit}` : 'No data'}** (7d change: ${weightTrend.delta7dKg > 0 ? '+' : ''}${displayWeight(weightTrend.delta7dKg, unit, 1)} ${wUnit})
• ${waistNote}

**Recovery**
• Readiness: **${recovery.score}/100 (${recovery.status})** • Avg Sleep: **${avgSleep !== null ? `${avgSleep} hrs` : 'No data'}** • Avg Steps: **${avgSteps !== null ? avgSteps.toLocaleString() : 'No data'}**

**Weekly Conclusion**
• **What went well:** ${well.join(' ') || 'Logged baseline activity cleanly.'}
• **Main bottleneck:** ${mainProblem}
• **Next week's 3 priorities:**
${priorities.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
}
