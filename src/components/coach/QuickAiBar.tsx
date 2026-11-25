import { ChevronUp, Send, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import {
  executeConfirmedMutation,
  type ActiveWorkoutBridge,
} from '../../services/ai/actionExecutor';
import { runCoachTurn } from '../../services/ai/orchestrator';
import type { CoachMode, CoachProposedAction } from '../../types';
import { Button } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

interface QuickAiBarProps {
  contextMode: CoachMode;
  workoutBridge: ActiveWorkoutBridge;
}

export function QuickAiBar({ contextMode, workoutBridge }: QuickAiBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyPreview, setReplyPreview] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<CoachProposedAction | null>(null);
  const { showToast } = useToast();

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setPendingAction(null);

    try {
      const res = await runCoachTurn({
        conversationId: 'quick-bar',
        mode: contextMode,
        userPrompt: trimmed,
        workoutBridge,
      });

      if (res.immediateToast) {
        const t = res.immediateToast;
        showToast(t.message, 'success', {
          label: 'Undo',
          onClick: async () => {
            await t.undo();
            showToast('Undid quick action', 'info');
          },
        });
        setText('');
        setReplyPreview(res.content);
      } else if (res.proposedAction) {
        setPendingAction(res.proposedAction);
        setReplyPreview(res.content);
      } else {
        setReplyPreview(res.content);
        setText('');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-[calc(4.35rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 mx-auto max-w-[460px] px-3 md:bottom-4 md:left-auto md:right-5 md:w-[390px] md:px-0">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Open Quick AI Assistant"
          className="ml-auto flex min-h-[42px] items-center gap-2 rounded-full border border-[#B7F36B]/40 bg-[#1D221F]/95 px-4 text-xs font-semibold text-[#B7F36B] shadow-xl backdrop-blur-md transition active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Quick AI Log &amp; Edit</span>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="rounded-3xl border border-[#303832] bg-[#171A18]/98 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#B7F36B]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Quick AI Action Bar</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setReplyPreview(null);
                setPendingAction(null);
              }}
              aria-label="Close Quick AI Bar"
              className="rounded-lg p-1 text-[#A1AAA3] hover:text-[#F3F5F2]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {replyPreview && (
            <div className="mb-2 max-h-32 overflow-y-auto rounded-2xl border border-[#252B28] bg-[#1D221F] p-2.5 text-xs text-[#F3F5F2]">
              <p className="whitespace-pre-line">{replyPreview.replace(/\*\*/g, '')}</p>
              {pendingAction && (
                <div className="mt-2 flex gap-2 border-t border-[#252B28] pt-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      const out = await executeConfirmedMutation(pendingAction);
                      showToast(out.message, 'success');
                      setPendingAction(null);
                      setText('');
                    }}
                  >
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPendingAction(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleRun} className="flex gap-1.5">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='e.g. "Log 2 rotis for lunch" or "Bench 60kg x 10"'
              className="min-h-[42px] flex-1 rounded-xl border border-[#303832] bg-[#1D221F] px-3 text-xs text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
            />
            <Button type="submit" size="sm" disabled={!text.trim() || busy}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
