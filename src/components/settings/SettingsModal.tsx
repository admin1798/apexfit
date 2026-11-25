import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell,
  Calculator,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { db } from '../../db/database';
import { clearAllUserData, DEFAULT_PROFILE_ID, resetToSampleData } from '../../db/seed';
import { exportDatabaseToJson, importDatabaseFromJson } from '../../services/backup';
import {
  ACTIVITY_MULTIPLIERS,
  GOAL_CONFIG,
  calculateMacroTargets,
} from '../../services/nutritionCalc';
import { enqueueSyncMutation, flushSyncQueue } from '../../services/syncService';
import { sha256Hex } from '../../services/crypto';
import { displayWeight, inputToKg, weightLabel } from '../../services/units';
import { AI_PROVIDERS } from '../../services/ai/providers';
import type {
  AIProviderId,
  ActivityLevel,
  DietType,
  ExperienceLevel,
  FitnessGoal,
  PreferredSplit,
  Sex,
  UnitSystem,
  UserProfile,
} from '../../types';
import { ConfirmDialog, ModalShell } from '../ui/Overlay';
import { Badge, Button, Input, Select } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  if (!isOpen || !profile) return null;

  return (
    <SettingsModalForm
      key={`${profile.id}-${profile.unitSystem}-${profile.weightKg}-${profile.calorieTarget}-${profile.sampleDataSeeded}`}
      profile={profile}
      onClose={onClose}
    />
  );
}

function SettingsModalForm({
  profile,
  onClose,
}: {
  profile: UserProfile;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const [name, setName] = useState(profile.name);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(profile.unitSystem ?? 'metric');
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [age, setAge] = useState(String(profile.age));
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [weightDisplay, setWeightDisplay] = useState(
    String(displayWeight(profile.weightKg, profile.unitSystem ?? 'metric', 1))
  );
  const [goalWeightDisplay, setGoalWeightDisplay] = useState(
    String(displayWeight(profile.goalWeightKg ?? profile.weightKg, profile.unitSystem ?? 'metric', 1))
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel);
  const [goal, setGoal] = useState<FitnessGoal>(profile.goal);
  const [weeklyRateKg, setWeeklyRateKg] = useState<number>(
    profile.weeklyRateKg ?? GOAL_CONFIG[profile.goal]?.defaultWeeklyRateKg ?? 0
  );
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    profile.experienceLevel ?? 'intermediate'
  );
  const [dietType, setDietType] = useState<DietType>(profile.dietType ?? 'bengali_indian');
  const [preferredWorkoutSplit, setPreferredWorkoutSplit] = useState<PreferredSplit>(
    profile.preferredWorkoutSplit ?? 'push_pull_legs'
  );
  const [waterGoalMl, setWaterGoalMl] = useState(String(profile.waterGoalMl));
  const [stepsGoal, setStepsGoal] = useState(String(profile.stepsGoal ?? 8500));
  const [sleepGoalHours, setSleepGoalHours] = useState(String(profile.sleepGoalHours ?? 7.5));
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState(
    String(profile.trainingDaysPerWeek ?? 5)
  );
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(profile.defaultRestSeconds);
  const [restSoundEnabled, setRestSoundEnabled] = useState(profile.restSoundEnabled ?? true);
  const [restVibrateEnabled, setRestVibrateEnabled] = useState(profile.restVibrateEnabled ?? true);
  const [privacyBlurPhotos, setPrivacyBlurPhotos] = useState(profile.privacyBlurPhotos ?? false);
  const [newPin, setNewPin] = useState('');
  const [aiProvider, setAiProvider] = useState<AIProviderId>(profile.aiProvider ?? 'gemini');
  const [aiModel, setAiModel] = useState(
    profile.aiModel ?? AI_PROVIDERS[profile.aiProvider ?? 'gemini'].defaultModel
  );
  const [geminiApiKey, setGeminiApiKey] = useState(profile.geminiApiKey);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const pendingSyncCount =
    useLiveQuery(() => db.syncQueue.where('status').equals('pending').count(), [], 0) ?? 0;

  const wUnit = weightLabel(unitSystem);
  const weightKgNum = Math.max(35, inputToKg(parseFloat(weightDisplay) || 74, unitSystem));
  const goalWeightKgNum = Math.max(35, inputToKg(parseFloat(goalWeightDisplay) || 74, unitSystem));

  const computed = calculateMacroTargets({
    sex,
    age: Math.max(14, parseInt(age, 10) || 26),
    heightCm: Math.max(120, parseFloat(heightCm) || 175),
    weightKg: weightKgNum,
    activityLevel,
    goal,
    weeklyRateKg,
  });

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    let nextPinHash = profile.pinHash;
    if (newPin.trim().length >= 4) {
      nextPinHash = await sha256Hex(newPin.trim());
    }

    const updated: Partial<UserProfile> = {
      name: name.trim() || 'Athlete',
      unitSystem,
      sex,
      age: Math.max(14, parseInt(age, 10) || 26),
      heightCm: Math.max(120, parseFloat(heightCm) || 175),
      weightKg: Math.round(weightKgNum * 10) / 10,
      goalWeightKg: Math.round(goalWeightKgNum * 10) / 10,
      activityLevel,
      goal,
      weeklyRateKg,
      experienceLevel,
      dietType,
      preferredWorkoutSplit,
      calorieTarget: computed.calorieTarget,
      proteinTarget: computed.proteinTarget,
      carbsTarget: computed.carbsTarget,
      fatsTarget: computed.fatsTarget,
      fiberTarget: computed.fiberTarget,
      waterGoalMl: Math.max(1000, parseInt(waterGoalMl, 10) || 3000),
      stepsGoal: Math.max(2000, parseInt(stepsGoal, 10) || 8500),
      sleepGoalHours: Math.max(4, Math.min(12, parseFloat(sleepGoalHours) || 7.5)),
      trainingDaysPerWeek: Math.max(1, Math.min(7, parseInt(trainingDaysPerWeek, 10) || 5)),
      defaultRestSeconds,
      restSoundEnabled,
      restVibrateEnabled,
      privacyBlurPhotos,
      pinHash: nextPinHash,
      aiProvider,
      aiModel: aiModel.trim() || AI_PROVIDERS[aiProvider].defaultModel,
      geminiApiKey: geminiApiKey.trim(),
    };

    await db.profile.update(DEFAULT_PROFILE_ID, updated);
    await enqueueSyncMutation('profile', DEFAULT_PROFILE_ID, 'upsert', updated);
    setNewPin('');
    showToast('Settings & nutrition targets saved', 'success');
  }

  async function handleExportJson() {
    const json = await exportDatabaseToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apexfit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported full JSON backup', 'success');
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const stats = await importDatabaseFromJson(text);
      showToast(`Restored ${stats.sessions} workouts & ${stats.foods} food logs`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to import JSON', 'danger');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <>
      <ModalShell
        isOpen
        title="Personal Settings"
        subtitle="Profile, units, targets, privacy & sync"
        onClose={onClose}
      >
        <form onSubmit={handleSaveSettings} className="space-y-4">
          {/* My Profile & Units */}
          <section className="space-y-3 rounded-3xl border border-[#252B28] bg-[#1D221F] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F3F5F2]">My Profile &amp; Units</h3>
              <button
                type="button"
                onClick={async () => {
                  await db.profile.update(DEFAULT_PROFILE_ID, { onboardingCompleted: false });
                  onClose();
                }}
                className="text-xs font-semibold text-[#B7F36B] hover:underline"
              >
                Re-run Setup Wizard
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <div>
                <span className="mb-1 block text-xs font-medium text-[#A1AAA3]">Unit System</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['metric', 'imperial'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => {
                        if (u === unitSystem) return;
                        const curKg = inputToKg(parseFloat(weightDisplay) || profile.weightKg, unitSystem);
                        const curGoalKg = inputToKg(
                          parseFloat(goalWeightDisplay) || profile.goalWeightKg,
                          unitSystem
                        );
                        setUnitSystem(u);
                        setWeightDisplay(String(displayWeight(curKg, u, 1)));
                        setGoalWeightDisplay(String(displayWeight(curGoalKg, u, 1)));
                      }}
                      className={`min-h-[44px] rounded-xl text-xs font-semibold capitalize ${
                        unitSystem === u
                          ? 'bg-[#B7F36B] text-[#101211]'
                          : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                      }`}
                    >
                      {u === 'metric' ? 'Metric (kg)' : 'Imp. (lb)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  className={`min-h-[40px] rounded-xl text-xs font-semibold capitalize ${
                    sex === s
                      ? 'bg-[#79B8F5] text-[#101211]'
                      : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Input label="Age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
              <Input
                label="Height (cm)"
                inputMode="decimal"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
              <Input
                label={`Weight (${wUnit})`}
                inputMode="decimal"
                value={weightDisplay}
                onChange={(e) => setWeightDisplay(e.target.value)}
              />
              <Input
                label={`Goal (${wUnit})`}
                inputMode="decimal"
                value={goalWeightDisplay}
                onChange={(e) => setGoalWeightDisplay(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Select
                label="Experience"
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </Select>
              <Select
                label="Preferred Split"
                value={preferredWorkoutSplit}
                onChange={(e) => setPreferredWorkoutSplit(e.target.value as PreferredSplit)}
              >
                <option value="push_pull_legs">Push / Pull / Legs</option>
                <option value="upper_lower">Upper / Lower</option>
                <option value="full_body">Full Body</option>
                <option value="bro_split">Bro Split</option>
              </Select>
              <Select
                label="Diet Preference"
                value={dietType}
                onChange={(e) => setDietType(e.target.value as DietType)}
              >
                <option value="bengali_indian">Bengali / Indian</option>
                <option value="non_veg">Non-Veg</option>
                <option value="eggetarian">Eggetarian</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="vegan">Vegan</option>
              </Select>
            </div>
          </section>

          {/* Nutrition Target Calculator */}
          <section className="space-y-3 rounded-3xl border border-[#252B28] bg-[#1D221F] p-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-[#B7F36B]" />
              <h3 className="text-sm font-bold text-[#F3F5F2]">
                Goals &amp; Smart Targets (Mifflin-St Jeor)
              </h3>
            </div>

            <Select
              label="Activity Level"
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
            >
              {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {ACTIVITY_MULTIPLIERS[lvl].label} — {ACTIVITY_MULTIPLIERS[lvl].detail}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {(Object.keys(GOAL_CONFIG) as FitnessGoal[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGoal(g);
                    setWeeklyRateKg(GOAL_CONFIG[g].defaultWeeklyRateKg);
                  }}
                  className={`min-h-[42px] rounded-xl px-2 text-xs font-semibold ${
                    goal === g
                      ? 'bg-[#B7F36B] text-[#101211]'
                      : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                  }`}
                >
                  {GOAL_CONFIG[g].shortLabel}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#303832] bg-[#171A18] px-3 py-2">
              <span className="text-xs text-[#A1AAA3]">Weekly Rate ({wUnit}/wk)</span>
              <input
                type="text"
                inputMode="decimal"
                value={weeklyRateKg}
                onChange={(e) => setWeeklyRateKg(parseFloat(e.target.value) || 0)}
                className="min-h-[36px] w-20 rounded-lg border border-[#303832] bg-[#1D221F] text-center text-xs font-semibold text-[#F3F5F2]"
              />
            </div>

            <div className="rounded-2xl border border-[#303832] bg-[#171A18] p-3">
              <div className="flex items-center justify-between text-xs text-[#A1AAA3]">
                <span>
                  BMR {computed.bmr} • TDEE {computed.tdee}
                </span>
                <span className="font-bold text-[#F3F5F2]">{computed.calorieTarget} kcal</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-center tabular-nums text-[11px]">
                <div className="rounded-xl bg-[#1D221F] py-1.5 text-[#B7F36B]">
                  P {computed.proteinTarget}g
                </div>
                <div className="rounded-xl bg-[#1D221F] py-1.5 text-[#79B8F5]">
                  C {computed.carbsTarget}g
                </div>
                <div className="rounded-xl bg-[#1D221F] py-1.5 text-[#EAB765]">
                  F {computed.fatsTarget}g
                </div>
                <div className="rounded-xl bg-[#1D221F] py-1.5 text-[#75D69A]">
                  Fib {computed.fiberTarget}g
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Input
                label="Water Goal (ml)"
                inputMode="numeric"
                value={waterGoalMl}
                onChange={(e) => setWaterGoalMl(e.target.value)}
              />
              <Input
                label="Daily Steps Goal"
                inputMode="numeric"
                value={stepsGoal}
                onChange={(e) => setStepsGoal(e.target.value)}
              />
              <Input
                label="Sleep Goal (hrs)"
                inputMode="decimal"
                value={sleepGoalHours}
                onChange={(e) => setSleepGoalHours(e.target.value)}
              />
              <Input
                label="Workouts / Week"
                inputMode="numeric"
                value={trainingDaysPerWeek}
                onChange={(e) => setTrainingDaysPerWeek(e.target.value)}
              />
            </div>
          </section>

          {/* Training Preferences & Alerts */}
          <section className="space-y-3 rounded-3xl border border-[#252B28] bg-[#1D221F] p-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#79B8F5]" />
              <h3 className="text-sm font-bold text-[#F3F5F2]">Training &amp; Rest Alerts</h3>
            </div>

            <Select
              label="Default Rest Timer"
              value={defaultRestSeconds}
              onChange={(e) => setDefaultRestSeconds(Number(e.target.value))}
            >
              {[60, 90, 120, 180].map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRestSoundEnabled((v) => !v)}
                className={`min-h-[42px] rounded-xl border px-3 text-xs font-semibold ${
                  restSoundEnabled
                    ? 'border-[#B7F36B]/40 bg-[#B7F36B]/15 text-[#B7F36B]'
                    : 'border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                }`}
              >
                Rest Chime: {restSoundEnabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => setRestVibrateEnabled((v) => !v)}
                className={`min-h-[42px] rounded-xl border px-3 text-xs font-semibold ${
                  restVibrateEnabled
                    ? 'border-[#B7F36B]/40 bg-[#B7F36B]/15 text-[#B7F36B]'
                    : 'border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                }`}
              >
                Haptics: {restVibrateEnabled ? 'On' : 'Off'}
              </button>
            </div>
          </section>

          {/* Gemini AI Key & Privacy */}
          <section className="space-y-3 rounded-3xl border border-[#252B28] bg-[#1D221F] p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#B7F36B]" />
              <h3 className="text-sm font-bold text-[#F3F5F2]">AI Provider &amp; Privacy Security</h3>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Select
                label="Coach AI Provider"
                value={aiProvider}
                onChange={(e) => {
                  const next = e.target.value as AIProviderId;
                  setAiProvider(next);
                  setAiModel(AI_PROVIDERS[next].defaultModel);
                }}
              >
                {(Object.keys(AI_PROVIDERS) as AIProviderId[]).map((pid) => (
                  <option key={pid} value={pid}>
                    {AI_PROVIDERS[pid].label}
                  </option>
                ))}
              </Select>
              <Input
                label="Model ID"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder={AI_PROVIDERS[aiProvider].defaultModel}
              />
            </div>
            <p className="text-[11px] text-[#727B74]">
              {AI_PROVIDERS[aiProvider].freeTierNote}. Cloud coach requests route securely via{' '}
              <code>/api/coach</code> so server secrets stay off the client.
            </p>

            <Input
              label="Optional Client Food-Parser Gemini Key"
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPrivacyBlurPhotos((v) => !v)}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
                  privacyBlurPhotos
                    ? 'border-[#B7F36B]/40 bg-[#B7F36B]/15 text-[#B7F36B]'
                    : 'border-[#303832] bg-[#171A18] text-[#A1AAA3]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                Blur Photos: {privacyBlurPhotos ? 'On' : 'Off'}
              </button>

              <div className="flex gap-1.5">
                <input
                  type="password"
                  inputMode="numeric"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder={profile.pinHash ? 'Change 4+ PIN' : 'Set App Lock PIN'}
                  className="min-h-[44px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-3 text-xs text-[#F3F5F2]"
                />
                {profile.pinHash && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await db.profile.update(DEFAULT_PROFILE_ID, { pinHash: undefined });
                      showToast('Removed App Lock PIN', 'info');
                    }}
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg">
              Save All Settings
            </Button>
          </section>

          {/* Sync Queue, Backup & Data Deletion */}
          <section className="space-y-3 rounded-3xl border border-[#252B28] bg-[#1D221F] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F3F5F2]">Offline Sync &amp; Data Backup</h3>
              <Badge tone={pendingSyncCount > 0 ? 'warning' : 'success'}>
                {pendingSyncCount} pending
              </Badge>
            </div>

            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                const res = await flushSyncQueue();
                showToast(`Synced ${res.syncedCount} queued record(s)`, 'success');
              }}
            >
              <RefreshCw className="h-4 w-4 text-[#79B8F5]" />
              Process Sync Queue Now
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={handleExportJson}>
                <Download className="h-4 w-4 text-[#B7F36B]" />
                Export JSON
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 text-[#79B8F5]" />
                Import JSON
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await resetToSampleData();
                  showToast('Restored 14-day sample dataset', 'info');
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Sample Data
              </Button>
              <Button variant="danger" onClick={() => setConfirmClearOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete All Data
              </Button>
            </div>
          </section>
        </form>
      </ModalShell>

      <ConfirmDialog
        isOpen={confirmClearOpen}
        title="Delete All Personal Data?"
        description="This permanently erases all logged workouts, nutrition logs, weights, measurements, progress photos, recovery check-ins, and coach messages from IndexedDB."
        confirmLabel="Delete Everything"
        danger
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          await clearAllUserData();
          setConfirmClearOpen(false);
          showToast('All personal data deleted', 'info');
        }}
      />
    </>
  );
}
