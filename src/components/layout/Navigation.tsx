import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  Bot,
  CheckCircle2,
  CloudOff,
  Dumbbell,
  FileBarChart2,
  Flame,
  HeartPulse,
  LayoutDashboard,
  RefreshCw,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../../db/database';
import { flushSyncQueue } from '../../services/syncService';

export type AppTab =
  | 'dashboard'
  | 'workouts'
  | 'nutrition'
  | 'progress'
  | 'recovery'
  | 'coach'
  | 'reports';

const DESKTOP_NAV: Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell },
  { id: 'nutrition', label: 'Nutrition', icon: Flame },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'recovery', label: 'Recovery', icon: HeartPulse },
  { id: 'coach', label: 'AI Coach', icon: Bot },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
];

const MOBILE_NAV: Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell },
  { id: 'nutrition', label: 'Nutrition', icon: Flame },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'coach', label: 'Coach', icon: Bot },
];

interface TopHeaderProps {
  title: string;
  subtitle?: string;
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenSettings: () => void;
}

export function TopHeader({
  title,
  subtitle,
  activeTab,
  onSelectTab,
  onOpenSettings,
}: TopHeaderProps) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingSyncCount =
    useLiveQuery(() => db.syncQueue.where('status').equals('pending').count(), [], 0) ?? 0;

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      void flushSyncQueue();
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function handleManualSync() {
    setIsSyncing(true);
    try {
      await flushSyncQueue();
    } finally {
      window.setTimeout(() => setIsSyncing(false), 350);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#252B28] bg-[#101211]/92 backdrop-blur-xl pt-safe">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-2 px-4 pb-3 pt-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#B7F36B] text-xs font-black text-[#101211] md:hidden">
              A
            </span>
            <h1 className="truncate text-lg font-bold tracking-tight text-[#F3F5F2]">{title}</h1>

            {isOffline ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#EAB765]/30 bg-[#EAB765]/15 px-2 py-0.5 text-[10px] font-semibold text-[#EAB765]">
                <CloudOff className="h-3 w-3" />
                Offline
              </span>
            ) : (
              <button
                type="button"
                onClick={handleManualSync}
                title={
                  pendingSyncCount > 0
                    ? `${pendingSyncCount} pending changes — tap to sync`
                    : 'All local changes synced'
                }
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                  pendingSyncCount > 0
                    ? 'border-[#79B8F5]/40 bg-[#79B8F5]/15 text-[#79B8F5]'
                    : 'border-[#303832] bg-[#1D221F] text-[#75D69A]'
                }`}
              >
                {isSyncing ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : pendingSyncCount > 0 ? (
                  <RefreshCw className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                <span>{pendingSyncCount > 0 ? `${pendingSyncCount} queued` : 'Synced'}</span>
              </button>
            )}
          </div>
          {subtitle && <p className="mt-0.5 truncate text-xs text-[#A1AAA3]">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectTab('recovery')}
            aria-label="Recovery & Health"
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition md:hidden ${
              activeTab === 'recovery'
                ? 'border-[#B7F36B]/40 bg-[#B7F36B]/15 text-[#B7F36B]'
                : 'border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
            }`}
          >
            <Activity className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('reports')}
            aria-label="Weekly & Monthly Reports"
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition md:hidden ${
              activeTab === 'reports'
                ? 'border-[#B7F36B]/40 bg-[#B7F36B]/15 text-[#B7F36B]'
                : 'border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
            }`}
          >
            <FileBarChart2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#303832] bg-[#1D221F] text-[#A1AAA3] transition hover:text-[#F3F5F2] active:scale-95"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

interface SidebarNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  hasActiveWorkout: boolean;
  onResumeWorkout: () => void;
}

export function SidebarNav({
  activeTab,
  onSelectTab,
  hasActiveWorkout,
  onResumeWorkout,
}: SidebarNavProps) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[#252B28] bg-[#171A18] px-3 py-5 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#B7F36B] text-sm font-black text-[#101211]">
          A
        </span>
        <div>
          <p className="text-sm font-bold tracking-tight text-[#F3F5F2]">ApexFit</p>
          <p className="text-[11px] text-[#727B74]">Personal Fitness OS</p>
        </div>
      </div>

      <nav aria-label="Desktop Navigation" className="flex-1 space-y-1">
        {DESKTOP_NAV.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium transition ${
                active
                  ? 'bg-[#B7F36B]/15 text-[#B7F36B]'
                  : 'text-[#A1AAA3] hover:bg-[#1D221F] hover:text-[#F3F5F2]'
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {hasActiveWorkout && (
        <button
          type="button"
          onClick={onResumeWorkout}
          className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-[#B7F36B] px-3 text-xs font-bold text-[#101211]"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#101211]" />
          Resume Active Workout
        </button>
      )}
    </aside>
  );
}

interface BottomNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  hasActiveWorkout: boolean;
}

export function BottomNav({ activeTab, onSelectTab, hasActiveWorkout }: BottomNavProps) {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#252B28] bg-[#101211]/95 backdrop-blur-xl pb-safe md:hidden"
    >
      <div className="mx-auto grid max-w-[460px] grid-cols-5 px-1.5 pt-1.5">
        {MOBILE_NAV.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`relative flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-medium transition active:scale-95 ${
                isActive ? 'text-[#B7F36B]' : 'text-[#A1AAA3] hover:text-[#F3F5F2]'
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
                {id === 'workouts' && hasActiveWorkout && (
                  <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-[#B7F36B] ring-2 ring-[#101211]" />
                )}
              </div>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
