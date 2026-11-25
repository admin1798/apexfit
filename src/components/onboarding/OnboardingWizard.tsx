import { ArrowLeft, ArrowRight, Check, Database, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { completeOnboardingWithProfile, createDefaultProfile } from '../../db/seed';
import {
  ACTIVITY_MULTIPLIERS,
  GOAL_CONFIG,
  calculateMacroTargets,
  computeRecommendedWaterMl,
} from '../../services/nutritionCalc';
import { displayWeight, inputToKg, weightLabel } from '../../services/units';
import type {
  ActivityLevel,
  DietType,
  ExperienceLevel,
  FitnessGoal,
  PreferredSplit,
  ProgramType,
  Sex,
  UnitSystem,
  UserProfile,
} from '../../types';
import { Badge, Button, Card, Input, ProgressBar, Select } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

interface OnboardingWizardProps {
  onCompleted: () => void;
}

const WEEKLY_RATES_BY_GOAL: Record<FitnessGoal, number[]> = {
  cut: [-0.75, -0.5, -0.25],
  lean_bulk: [0.15, 0.25, 0.4],
  recomp: [-0.15, 0, 0.1],
  maintain: [0],
};

const SPLIT_OPTIONS: Array<{
  id: PreferredSplit;
  programType: ProgramType;
  label: string;
  desc: string;
}> = [
  { id: 'push_pull_legs', programType: 'push', label: 'Push / Pull / Legs', desc: 'Balanced 3–6 day split' },
  { id: 'upper_lower', programType: 'upper', label: 'Upper / Lower', desc: '4-day strength & hypertrophy' },
  { id: 'full_body', programType: 'full_body', label: 'Full Body', desc: '3–4x/wk high-frequency' },
  { id: 'bro_split', programType: 'custom', label: 'Bro Split', desc: 'Chest, Back, Shoulders, Legs' },
];

const DIET_OPTIONS: Array<{ id: DietType; label: string }> = [
  { id: 'bengali_indian', label: 'Bengali / Indian Home Diet' },
  { id: 'non_veg', label: 'Non-Veg (High Protein)' },
  { id: 'eggetarian', label: 'Eggetarian' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
];

export function OnboardingWizard({ onCompleted }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  // Step 1: Basics
  const [name, setName] = useState('');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft_in'>('cm');
  const [age, setAge] = useState('26');
  const [sex, setSex] = useState<Sex>('male');
  const [heightCmInput, setHeightCmInput] = useState('176');
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('9');
  const [weightInput, setWeightInput] = useState('74');
  const [targetWeightInput, setTargetWeightInput] = useState('76');

  // Step 2: Goal & Pace
  const [goal, setGoal] = useState<FitnessGoal>('lean_bulk');
  const [weeklyRateKg, setWeeklyRateKg] = useState<number>(0.25);

  // Step 3: Activity & Training
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('intermediate');
  const [preferredSplit, setPreferredSplit] = useState<PreferredSplit>('push_pull_legs');
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState<number>(4);

  // Step 4: Diet, Water, AI & Launch mode
  const [dietType, setDietType] = useState<DietType>('bengali_indian');
  const [waterGoalOverride, setWaterGoalOverride] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  const resolvedHeightCm =
    heightUnit === 'cm'
      ? Math.max(120, Math.min(230, parseFloat(heightCmInput) || 176))
      : Math.max(
          120,
          Math.min(
            230,
            Math.round(((parseFloat(heightFt) || 5) * 12 + (parseFloat(heightIn) || 9)) * 2.54)
          )
        );

  const weightKg = Math.max(35, inputToKg(parseFloat(weightInput) || 74, unitSystem));
  const goalWeightKg = Math.max(35, inputToKg(parseFloat(targetWeightInput) || 76, unitSystem));
  const ageNum = Math.max(14, Math.min(90, parseInt(age, 10) || 26));
  const wUnit = weightLabel(unitSystem);

  const computed = calculateMacroTargets({
    sex,
    age: ageNum,
    heightCm: resolvedHeightCm,
    weightKg,
    activityLevel,
    goal,
    weeklyRateKg,
  });

  const recommendedWaterMl = computeRecommendedWaterMl(weightKg);
  const resolvedWaterMl = waterGoalOverride
    ? Math.max(1000, parseInt(waterGoalOverride, 10) || recommendedWaterMl)
    : recommendedWaterMl;

  async function finishOnboarding(dataMode: 'fresh' | 'demo') {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const base = createDefaultProfile();
      const splitCfg = SPLIT_OPTIONS.find((s) => s.id === preferredSplit);

      const finalProfile: UserProfile = {
        ...base,
        name: name.trim() || 'Athlete',
        sex,
        age: ageNum,
        heightCm: Math.round(resolvedHeightCm),
        weightKg: Math.round(weightKg * 10) / 10,
        goalWeightKg: Math.round(goalWeightKg * 10) / 10,
        activityLevel,
        goal,
        weeklyRateKg,
        experienceLevel,
        dietType,
        preferredWorkoutSplit: preferredSplit,
        preferredSplit: splitCfg?.programType ?? 'push',
        trainingDaysPerWeek,
        unitSystem,
        calorieTarget: computed.calorieTarget,
        proteinTarget: computed.proteinTarget,
        carbsTarget: computed.carbsTarget,
        fatsTarget: computed.fatsTarget,
        fiberTarget: computed.fiberTarget,
        waterGoalMl: resolvedWaterMl,
        geminiApiKey: geminiApiKey.trim(),
        onboardingCompleted: true,
        sampleDataSeeded: dataMode === 'demo',
      };

      await completeOnboardingWithProfile(finalProfile, dataMode);
      showToast(
        dataMode === 'demo'
          ? 'Profile personalized with 14-day demo logs'
          : 'Welcome to ApexFit! Your targets & split are ready',
        'success'
      );
      onCompleted();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#101211] text-[#F3F5F2] pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-4 py-4">
        {/* Brand & Step Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#B7F36B] text-sm font-black text-[#101211]">
                A
              </span>
              <div>
                <h1 className="text-base font-bold text-[#F3F5F2]">Welcome to ApexFit</h1>
                <p className="text-xs text-[#A1AAA3]">Step {step} of 4 • Personal Setup</p>
              </div>
            </div>
            <Badge tone="lime">{Math.round((step / 4) * 100)}%</Badge>
          </div>
          <ProgressBar value={step} max={4} tone="lime" className="mt-3" />
        </div>

        {/* Step Content */}
        <div className="flex-1 space-y-4">
          {step === 1 && (
            <Card className="space-y-3.5">
              <h2 className="text-base font-bold text-[#F3F5F2]">1. Your Basics</h2>
              <Input
                label="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Arijit"
              />

              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  label="Age"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
                <div>
                  <span className="mb-1 block text-xs font-medium text-[#A1AAA3]">Biological Sex</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['male', 'female'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSex(s)}
                        className={`min-h-[44px] rounded-xl text-xs font-semibold capitalize ${
                          sex === s
                            ? 'bg-[#B7F36B] text-[#101211]'
                            : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Height */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#A1AAA3]">Height</span>
                  <div className="flex gap-1">
                    {(['cm', 'ft_in'] as const).map((hu) => (
                      <button
                        key={hu}
                        type="button"
                        onClick={() => setHeightUnit(hu)}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                          heightUnit === hu
                            ? 'bg-[#B7F36B] text-[#101211]'
                            : 'bg-[#171A18] text-[#A1AAA3]'
                        }`}
                      >
                        {hu === 'cm' ? 'cm' : 'ft / in'}
                      </button>
                    ))}
                  </div>
                </div>

                {heightUnit === 'cm' ? (
                  <Input
                    inputMode="decimal"
                    value={heightCmInput}
                    onChange={(e) => setHeightCmInput(e.target.value)}
                    placeholder="176"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Feet"
                      inputMode="numeric"
                      value={heightFt}
                      onChange={(e) => setHeightFt(e.target.value)}
                    />
                    <Input
                      label="Inches"
                      inputMode="numeric"
                      value={heightIn}
                      onChange={(e) => setHeightIn(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Weight + Unit Toggle */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#A1AAA3]">Weight Units</span>
                  <div className="flex gap-1">
                    {(['metric', 'imperial'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          if (u === unitSystem) return;
                          const curKg = inputToKg(parseFloat(weightInput) || 74, unitSystem);
                          const tgtKg = inputToKg(parseFloat(targetWeightInput) || 76, unitSystem);
                          setUnitSystem(u);
                          setWeightInput(String(displayWeight(curKg, u, 1)));
                          setTargetWeightInput(String(displayWeight(tgtKg, u, 1)));
                        }}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                          unitSystem === u
                            ? 'bg-[#B7F36B] text-[#101211]'
                            : 'bg-[#171A18] text-[#A1AAA3]'
                        }`}
                      >
                        {u === 'metric' ? 'kg' : 'lb'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Input
                    label={`Current (${wUnit})`}
                    inputMode="decimal"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                  />
                  <Input
                    label={`Target (${wUnit})`}
                    inputMode="decimal"
                    value={targetWeightInput}
                    onChange={(e) => setTargetWeightInput(e.target.value)}
                  />
                </div>
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card className="space-y-4">
              <h2 className="text-base font-bold text-[#F3F5F2]">2. Goal &amp; Weekly Pace</h2>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(GOAL_CONFIG) as FitnessGoal[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGoal(g);
                      setWeeklyRateKg(GOAL_CONFIG[g].defaultWeeklyRateKg);
                    }}
                    className={`flex min-h-[52px] items-center justify-between rounded-2xl border px-3.5 text-left transition ${
                      goal === g
                        ? 'border-[#B7F36B] bg-[#B7F36B]/12'
                        : 'border-[#303832] bg-[#171A18]'
                    }`}
                  >
                    <span className="text-sm font-semibold text-[#F3F5F2]">
                      {GOAL_CONFIG[g].label}
                    </span>
                    {goal === g && <Check className="h-4 w-4 text-[#B7F36B]" />}
                  </button>
                ))}
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-[#A1AAA3]">
                  Weekly Rate ({wUnit}/week)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {WEEKLY_RATES_BY_GOAL[goal].map((rateKg) => {
                    const disp = displayWeight(rateKg, unitSystem, 2);
                    const label = `${rateKg > 0 ? '+' : ''}${disp} ${wUnit}/wk`;
                    return (
                      <button
                        key={rateKg}
                        type="button"
                        onClick={() => setWeeklyRateKg(rateKg)}
                        className={`min-h-[44px] rounded-xl text-xs font-semibold ${
                          weeklyRateKg === rateKg
                            ? 'bg-[#B7F36B] text-[#101211]'
                            : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {step === 3 && (
            <Card className="space-y-4">
              <h2 className="text-base font-bold text-[#F3F5F2]">3. Activity &amp; Training</h2>

              <Select
                label="Daily Activity Level"
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              >
                {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {ACTIVITY_MULTIPLIERS[lvl].label} — {ACTIVITY_MULTIPLIERS[lvl].detail}
                  </option>
                ))}
              </Select>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-[#A1AAA3]">
                  Gym Experience
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['beginner', 'intermediate', 'advanced'] as const).map((exp) => (
                    <button
                      key={exp}
                      type="button"
                      onClick={() => setExperienceLevel(exp)}
                      className={`min-h-[42px] rounded-xl text-xs font-semibold capitalize ${
                        experienceLevel === exp
                          ? 'bg-[#B7F36B] text-[#101211]'
                          : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                      }`}
                    >
                      {exp}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-[#A1AAA3]">
                  Preferred Workout Split
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {SPLIT_OPTIONS.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => setPreferredSplit(sp.id)}
                      className={`min-h-[58px] rounded-2xl border p-2.5 text-left ${
                        preferredSplit === sp.id
                          ? 'border-[#B7F36B] bg-[#B7F36B]/12'
                          : 'border-[#303832] bg-[#171A18]'
                      }`}
                    >
                      <p className="text-xs font-bold text-[#F3F5F2]">{sp.label}</p>
                      <p className="text-[11px] text-[#727B74]">{sp.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-[#A1AAA3]">
                  Weekly Training Days
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 4, 5, 6].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTrainingDaysPerWeek(d)}
                      className={`min-h-[42px] rounded-xl text-xs font-bold ${
                        trainingDaysPerWeek === d
                          ? 'bg-[#B7F36B] text-[#101211]'
                          : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                      }`}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {step === 4 && (
            <div className="space-y-3.5">
              <Card className="space-y-3.5">
                <h2 className="text-base font-bold text-[#F3F5F2]">4. Diet, Hydration &amp; AI</h2>

                <Select
                  label="Diet Preference"
                  value={dietType}
                  onChange={(e) => setDietType(e.target.value as DietType)}
                >
                  {DIET_OPTIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>

                <Input
                  label={`Daily Water Goal (ml) — Recommended: ${recommendedWaterMl} ml`}
                  inputMode="numeric"
                  value={waterGoalOverride}
                  onChange={(e) => setWaterGoalOverride(e.target.value)}
                  placeholder={String(recommendedWaterMl)}
                />

                <Input
                  label="Optional Gemini API Key (skip if using offline mode)"
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy... (optional)"
                />
              </Card>

              {/* Computed Targets Preview */}
              <Card elevated>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#B7F36B]">
                    Your Computed Targets
                  </span>
                  <span className="tabular-nums text-sm font-bold text-[#F3F5F2]">
                    {computed.calorieTarget} kcal/day
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center tabular-nums text-xs">
                  <div className="rounded-xl bg-[#171A18] py-2 text-[#B7F36B]">
                    P {computed.proteinTarget}g
                  </div>
                  <div className="rounded-xl bg-[#171A18] py-2 text-[#79B8F5]">
                    C {computed.carbsTarget}g
                  </div>
                  <div className="rounded-xl bg-[#171A18] py-2 text-[#EAB765]">
                    F {computed.fatsTarget}g
                  </div>
                  <div className="rounded-xl bg-[#171A18] py-2 text-[#75D69A]">
                    Fib {computed.fiberTarget}g
                  </div>
                </div>
              </Card>

              <div className="space-y-2">
                <Button
                  size="lg"
                  className="w-full"
                  disabled={isSaving}
                  onClick={() => finishOnboarding('fresh')}
                >
                  <Sparkles className="h-4 w-4" />
                  Start Fresh (0 Logs)
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full"
                  disabled={isSaving}
                  onClick={() => finishOnboarding('demo')}
                >
                  <Database className="h-4 w-4 text-[#79B8F5]" />
                  Load 14-Day Demo Data
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Step Footer Controls */}
        <div className="mt-5 flex items-center justify-between gap-2.5">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 4 && (
            <Button onClick={() => setStep((s) => s + 1)}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
