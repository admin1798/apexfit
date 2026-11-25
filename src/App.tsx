import { useLiveQuery } from 'dexie-react-hooks';
import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CoachTab } from './components/coach/CoachTab';
import { QuickAiBar } from './components/coach/QuickAiBar';
import { DashboardTab } from './components/dashboard/DashboardTab';
import { BottomNav, SidebarNav, TopHeader, type AppTab } from './components/layout/Navigation';
import { NutritionTab } from './components/nutrition/NutritionTab';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { ProgressTab } from './components/progress/ProgressTab';
import { RecoveryTab } from './components/recovery/RecoveryTab';
import { ReportsTab } from './components/reports/ReportsTab';
import { SettingsModal } from './components/settings/SettingsModal';
import { sha256Hex } from './services/crypto';
import { ToastProvider } from './components/ui/Toast';
import { Button } from './components/ui/primitives';
import { ActiveWorkoutSheet } from './components/workout/ActiveWorkoutSheet';
import { WorkoutTab } from './components/workout/WorkoutTab';
import { db } from './db/database';
import { DEFAULT_PROFILE_ID, ensureDatabaseSeeded } from './db/seed';
import { flushSyncQueue } from './services/syncService';
import type { ActiveWorkoutDraft, Routine, WorkoutExerciseLog } from './types';

const ACTIVE_DRAFT_KEY = 'apexfit_active_workout_draft_v1';

const TAB_META: Record<AppTab, { title: string; subtitle: string }> = {
  dashboard: { title: 'ApexFit', subtitle: "Today's Command Center" },
  workouts: { title: 'Workouts', subtitle: 'Programs, Exercise Library & Calendar' },
  nutrition: { title: 'Nutrition', subtitle: 'Bengali, Indian & AI Macro Logger' },
  progress: { title: 'Progress', subtitle: 'Weight, Measurements, Photos & Lifts' },
  recovery: { title: 'Recovery', subtitle: 'Sleep, Steps, Readiness & Habits' },
  coach: { title: 'AI Coach', subtitle: 'Context-Aware Performance Assistant' },
  reports: { title: 'Reports', subtitle: 'Weekly & Monthly Analytics' },
};

function loadSavedDraft(): ActiveWorkoutDraft | null {
  try {
    const raw = localStorage.getItem(ACTIVE_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ActiveWorkoutDraft) : null;
  } catch {
    return null;
  }
}

function ApexFitShell() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<ActiveWorkoutDraft | null>(() => loadSavedDraft());
  const [isWorkoutSheetOpen, setIsWorkoutSheetOpen] = useState<boolean>(
    () => loadSavedDraft() !== null
  );
  const [unlocked, setUnlocked] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);

  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);

  useEffect(() => {
    ensureDatabaseSeeded().then(() => {
      setReady(true);
      if (navigator.onLine) {
        void flushSyncQueue();
      }
    });
  }, []);

  useEffect(() => {
    if (activeDraft) {
      localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(activeDraft));
    } else {
      localStorage.removeItem(ACTIVE_DRAFT_KEY);
    }
  }, [activeDraft]);

  function startRoutineWorkout(routine: Routine) {
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const blockLogs: WorkoutExerciseLog[] = routine.items.map((item) => {
      const ex = exMap.get(item.exerciseId);
      return {
        exerciseId: item.exerciseId,
        exerciseName: ex?.name ?? item.exerciseId,
        muscleGroup: ex?.muscleGroup ?? 'Chest',
        restSeconds: item.restSeconds,
        sets: Array.from({ length: item.defaultSets }, (_, i) => ({
          id: `set-${Date.now()}-${item.exerciseId}-${i}`,
          weightKg: null,
          reps: null,
          rpe: null,
          setType: 'working',
          completed: false,
        })),
      };
    });

    setActiveDraft({
      id: `sess-${Date.now()}`,
      routineId: routine.id,
      routineName: routine.name,
      startedAt: new Date().toISOString(),
      notes: '',
      exercises: blockLogs,
    });
    setIsWorkoutSheetOpen(true);
  }

  function startEmptyWorkout() {
    setActiveDraft({
      id: `sess-${Date.now()}`,
      routineName: 'Freestyle Workout',
      startedAt: new Date().toISOString(),
      notes: '',
      exercises: [],
    });
    setIsWorkoutSheetOpen(true);
  }

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#101211] text-[#A1AAA3]">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B7F36B] text-xl font-black text-[#101211]">
            A
          </div>
          <p className="text-sm font-medium text-[#F3F5F2]">Initializing ApexFit...</p>
        </div>
      </div>
    );
  }

  if (ready && (!profile || !profile.onboardingCompleted)) {
    return <OnboardingWizard onCompleted={() => setActiveTab('dashboard')} />;
  }

  if (profile?.pinHash && !unlocked) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#101211] p-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const hash = await sha256Hex(pinEntry.trim());
            if (hash === profile.pinHash) {
              setUnlocked(true);
              setPinError(false);
            } else {
              setPinError(true);
            }
          }}
          className="w-full max-w-[340px] rounded-3xl border border-[#303832] bg-[#1D221F] p-6 text-center"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B7F36B]/15 text-[#B7F36B]">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[#F3F5F2]">ApexFit Locked</h1>
          <p className="mt-1 text-xs text-[#A1AAA3]">Enter your personal PIN to unlock</p>
          <input
            type="password"
            inputMode="numeric"
            value={pinEntry}
            onChange={(e) => setPinEntry(e.target.value)}
            placeholder="••••"
            className="mt-4 min-h-[48px] w-full rounded-2xl border border-[#303832] bg-[#171A18] text-center text-lg tracking-widest text-[#F3F5F2] focus:border-[#B7F36B] focus:outline-none"
          />
          {pinError && <p className="mt-2 text-xs text-[#E87979]">Incorrect PIN</p>}
          <Button type="submit" className="mt-4 w-full" size="lg">
            Unlock
          </Button>
        </form>
      </div>
    );
  }

  const meta = TAB_META[activeTab];

  return (
    <div className="flex min-h-[100dvh] bg-[#101211] text-[#F3F5F2]">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hasActiveWorkout={activeDraft !== null}
        onResumeWorkout={() => setIsWorkoutSheetOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          title={meta.title}
          subtitle={meta.subtitle}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="mx-auto w-full max-w-[1040px] flex-1 pb-nav-safe md:pb-10">
          {activeTab === 'dashboard' && (
            <DashboardTab
              onStartRoutine={startRoutineWorkout}
              onGoToNutrition={() => setActiveTab('nutrition')}
              onGoToProgress={() => setActiveTab('progress')}
              onGoToRecovery={() => setActiveTab('recovery')}
              onGoToCoach={() => setActiveTab('coach')}
              hasActiveWorkout={activeDraft !== null}
              onResumeWorkout={() => setIsWorkoutSheetOpen(true)}
            />
          )}

          {activeTab === 'workouts' && (
            <WorkoutTab
              onStartRoutine={startRoutineWorkout}
              onStartEmptyWorkout={startEmptyWorkout}
              hasActiveWorkout={activeDraft !== null}
              onResumeWorkout={() => setIsWorkoutSheetOpen(true)}
            />
          )}

          {activeTab === 'nutrition' && (
            <NutritionTab onOpenSettings={() => setSettingsOpen(true)} />
          )}

          {activeTab === 'progress' && <ProgressTab />}
          {activeTab === 'recovery' && <RecoveryTab />}
          {activeTab === 'coach' && (
            <CoachTab workoutBridge={{ activeDraft, onUpdateDraft: setActiveDraft }} />
          )}
          {activeTab === 'reports' && <ReportsTab />}
        </main>
      </div>

      {(activeTab === 'dashboard' || activeTab === 'workouts' || activeTab === 'nutrition') &&
        !isWorkoutSheetOpen && (
          <QuickAiBar
            contextMode={activeTab === 'nutrition' ? 'nutrition' : 'workout'}
            workoutBridge={{ activeDraft, onUpdateDraft: setActiveDraft }}
          />
        )}

      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hasActiveWorkout={activeDraft !== null}
      />

      {activeDraft && isWorkoutSheetOpen && (
        <ActiveWorkoutSheet
          draft={activeDraft}
          onUpdateDraft={setActiveDraft}
          onMinimize={() => setIsWorkoutSheetOpen(false)}
          onFinishSession={() => {
            setActiveDraft(null);
            setIsWorkoutSheetOpen(false);
            setActiveTab('workouts');
          }}
          onDiscard={() => {
            setActiveDraft(null);
            setIsWorkoutSheetOpen(false);
          }}
        />
      )}

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ApexFitShell />
    </ToastProvider>
  );
}
