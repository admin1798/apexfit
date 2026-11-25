import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bot,
  Brain,
  Check,
  Copy,
  Edit3,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import {
  executeConfirmedMutation,
  type ActiveWorkoutBridge,
} from '../../services/ai/actionExecutor';
import {
  deleteMemory,
  syncBaselineMemories,
  upsertManualMemory,
} from '../../services/ai/memoryService';
import { runCoachTurn } from '../../services/ai/orchestrator';
import { AI_PROVIDERS } from '../../services/ai/providers';
import type {
  CoachConversation,
  CoachMemory,
  CoachMessage,
  CoachMode,
  MemoryCategory,
} from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Badge, Button, Card, Input, Select } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

const MODES: Array<{ id: CoachMode; label: string }> = [
  { id: 'workout', label: 'Workout' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'progress', label: 'Progress' },
  { id: 'general', label: 'Assistant' },
];

const SUGGESTED_PROMPTS: Record<CoachMode, string[]> = {
  workout: [
    'Log 3 sets of Bench Press: 60kg x 10, 65kg x 8, 70kg x 6',
    'Swap Barbell Row for Lat Pulldown in my Pull routine',
    'Analyze my last workout',
    'What should I train today?',
  ],
  nutrition: [
    'Log 2 rotis, 1 bowl masoor dal, and 150g chicken kosha for lunch',
    'Help me reach my protein target',
    'What should I eat tonight?',
  ],
  recovery: [
    'Am I recovering properly?',
    'Should I train today or rest?',
    'Analyze my sleep & soreness pattern',
  ],
  progress: [
    'Analyze my weekly progress',
    'Generate my Weekly Fitness Analyst report',
    'Why am I not progressing?',
  ],
  general: [
    'What should I train today?',
    'Generate a new pull workout program',
    'Analyze my weekly progress',
  ],
};

const MEMORY_CATEGORIES: MemoryCategory[] = [
  'profile',
  'training',
  'nutrition',
  'recovery',
  'conversation',
];

function renderInlineMarkdown(line: string) {
  const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[#F3F5F2]">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('*') && tok.endsWith('*')) {
      return (
        <em key={i} className="italic text-[#A1AAA3]">
          {tok.slice(1, -1)}
        </em>
      );
    }
    return tok;
  });
}

function FormattedCoachText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        if (line.startsWith('### ')) {
          return (
            <h4 key={idx} className="pt-1 text-sm font-bold text-[#B7F36B]">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.trim() === '') {
          return <div key={idx} className="h-1" />;
        }
        return (
          <p key={idx} className="leading-relaxed text-[#F3F5F2]/95">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}

interface CoachTabProps {
  workoutBridge?: ActiveWorkoutBridge;
}

export function CoachTab({ workoutBridge }: CoachTabProps) {
  const [mode, setMode] = useState<CoachMode>('workout');
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [lastErrorNotice, setLastErrorNotice] = useState<string | null>(null);
  const [dismissedActions, setDismissedActions] = useState<Record<string, boolean>>({});

  // Conversation Drawer & Rename State
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingConv, setRenamingConv] = useState<CoachConversation | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  // Memory Manager State
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memFilter, setMemFilter] = useState<MemoryCategory | 'all'>('all');
  const [editingMemory, setEditingMemory] = useState<CoachMemory | null>(null);
  const [memCat, setMemCat] = useState<MemoryCategory>('training');
  const [memKey, setMemKey] = useState('');
  const [memContent, setMemContent] = useState('');

  const { showToast } = useToast();
  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const conversations = useLiveQuery(
    () => db.coachConversations.orderBy('updatedAt').reverse().toArray(),
    [],
    []
  );
  const memories = useLiveQuery(
    () => db.coachMemories.orderBy('updatedAt').reverse().toArray(),
    [],
    []
  );

  useEffect(() => {
    void syncBaselineMemories();
  }, []);

  const currentConv =
    conversations.find((c) => c.id === activeConvId) ?? conversations[0] ?? null;
  const resolvedConvId = currentConv?.id ?? '';

  const messages = useLiveQuery(
    () =>
      resolvedConvId
        ? db.coachMessages.where('conversationId').equals(resolvedConvId).sortBy('createdAt')
        : Promise.resolve([] as CoachMessage[]),
    [resolvedConvId],
    []
  );

  const providerId = profile?.aiProvider ?? 'gemini';
  const providerMeta = AI_PROVIDERS[providerId];

  async function ensureConversation(targetMode: CoachMode, firstPrompt?: string): Promise<string> {
    if (resolvedConvId) return resolvedConvId;
    const now = new Date().toISOString();
    const id = `conv-${Date.now()}`;
    const title = firstPrompt
      ? firstPrompt.slice(0, 34) + (firstPrompt.length > 34 ? '…' : '')
      : `${targetMode.charAt(0).toUpperCase() + targetMode.slice(1)} Session`;
    await db.coachConversations.put({
      id,
      title,
      mode: targetMode,
      createdAt: now,
      updatedAt: now,
    });
    setActiveConvId(id);
    return id;
  }

  async function handleNewConversation() {
    const now = new Date().toISOString();
    const id = `conv-${Date.now()}`;
    await db.coachConversations.put({
      id,
      title: `New ${mode.charAt(0).toUpperCase() + mode.slice(1)} Chat`,
      mode,
      createdAt: now,
      updatedAt: now,
    });
    setActiveConvId(id);
    setHistoryOpen(false);
    setLastErrorNotice(null);
  }

  async function handleDeleteConversation(convId: string) {
    const msgs = await db.coachMessages.where('conversationId').equals(convId).toArray();
    await db.coachMessages.bulkDelete(msgs.map((m) => m.id));
    await db.coachConversations.delete(convId);
    if (activeConvId === convId) setActiveConvId('');
    showToast('Deleted conversation', 'info');
  }

  async function handleClearConversation() {
    if (!resolvedConvId) return;
    const msgs = await db.coachMessages.where('conversationId').equals(resolvedConvId).toArray();
    await db.coachMessages.bulkDelete(msgs.map((m) => m.id));
    showToast('Cleared messages in thread', 'info');
  }

  async function sendPrompt(text: string, skipUserPersist = false) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setInput('');
    setIsSending(true);
    setStreamingText('');
    setLastErrorNotice(null);

    const convId = await ensureConversation(mode, trimmed);
    const now = new Date().toISOString();

    try {
      if (!skipUserPersist) {
        const userMsg: CoachMessage = {
          id: `cm-${Date.now()}-u`,
          conversationId: convId,
          mode,
          role: 'user',
          content: trimmed,
          createdAt: now,
        };
        await db.coachMessages.put(userMsg);

        const existingConv = await db.coachConversations.get(convId);
        if (existingConv && existingConv.title.startsWith('New ')) {
          await db.coachConversations.update(convId, {
            title: trimmed.slice(0, 36) + (trimmed.length > 36 ? '…' : ''),
            updatedAt: now,
          });
        } else {
          await db.coachConversations.update(convId, { updatedAt: now });
        }
      }

      const reply = await runCoachTurn({
        conversationId: convId,
        mode,
        userPrompt: trimmed,
        workoutBridge,
        onTokenChunk: (partial) => setStreamingText(partial),
      });

      if (reply.errorNote) {
        setLastErrorNotice(reply.errorNote);
      }

      if (reply.immediateToast) {
        const toastData = reply.immediateToast;
        showToast(toastData.message, 'success', {
          label: 'Undo',
          onClick: async () => {
            await toastData.undo();
            showToast('Action undone', 'info');
          },
        });
      }

      const botMsg: CoachMessage = {
        id: `cm-${Date.now()}-a`,
        conversationId: convId,
        mode,
        role: 'assistant',
        content: reply.content,
        contextUsed: reply.contextUsed,
        providerUsed: reply.providerUsed,
        proposedAction: reply.proposedAction,
        createdAt: new Date().toISOString(),
      };
      await db.coachMessages.put(botMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate coaching response.';
      setLastErrorNotice(msg);
      showToast('Coach request failed — your message is preserved', 'warning');
    } finally {
      setStreamingText('');
      setIsSending(false);
    }
  }

  async function handleRetryLast() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    await sendPrompt(lastUser.content, true);
  }

  async function handleApplyInlineAction(msg: CoachMessage) {
    if (!msg.proposedAction) return;
    const res = await executeConfirmedMutation(msg.proposedAction);
    await db.coachMessages.update(msg.id, { actionApplied: true });
    showToast(res.message, 'success');
  }

  async function handleSaveMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!memContent.trim()) return;
    await upsertManualMemory({
      id: editingMemory?.id,
      category: memCat,
      key: memKey || memContent.slice(0, 20),
      content: memContent,
    });
    setEditingMemory(null);
    setMemKey('');
    setMemContent('');
    showToast('Saved AI memory', 'success');
  }

  const filteredMemories =
    memFilter === 'all' ? memories : memories.filter((m) => m.category === memFilter);

  return (
    <div className="flex flex-col space-y-3 px-4 pt-4">
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#B7F36B]/15 text-[#B7F36B]">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-[#F3F5F2]">
                {currentConv?.title ?? 'ApexFit Personal Coach'}
              </h2>
              <p className="truncate text-[11px] text-[#A1AAA3]">
                {providerMeta.label} • {memories.length} memories
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setMemoryOpen(true)}
              aria-label="Inspect AI Memories"
              title="AI Memory"
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#303832] bg-[#171A18] px-2.5 text-[11px] font-semibold text-[#B7F36B]"
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Memory</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="Conversation History"
              title="Conversations"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-[#303832] bg-[#171A18] text-[#F3F5F2]"
            >
              <MessagesSquare className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNewConversation}
              aria-label="New Conversation"
              title="New Chat"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl bg-[#B7F36B] text-[#101211]"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`min-h-[34px] shrink-0 rounded-full px-3 text-xs font-semibold transition ${
                mode === m.id
                  ? 'bg-[#B7F36B] text-[#101211]'
                  : 'border border-[#303832] bg-[#171A18] text-[#A1AAA3]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_PROMPTS[mode].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => sendPrompt(p)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-[#303832] bg-[#1D221F] px-3 py-1.5 text-left text-xs text-[#F3F5F2] hover:border-[#B7F36B]/50"
          >
            <Sparkles className="h-3 w-3 shrink-0 text-[#B7F36B]" />
            <span>{p}</span>
          </button>
        ))}
      </div>

      {lastErrorNotice && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#EAB765]/30 bg-[#EAB765]/10 px-3.5 py-2.5 text-xs text-[#EAB765]">
          <span>{lastErrorNotice}</span>
          <button
            type="button"
            onClick={handleRetryLast}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#252B27] px-2.5 py-1 text-[11px] font-semibold text-[#F3F5F2]"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      <div className="space-y-3">
        {messages.length === 0 && !isSending && (
          <div className="rounded-3xl border border-dashed border-[#303832] bg-[#171A18] p-5 text-center text-xs text-[#A1AAA3]">
            Tell ApexFit Coach to log meals, edit/remove foods, log workout sets, swap exercises, or analyze your training, nutrition, and recovery.
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-2xl p-3.5 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'ml-8 border border-[#B7F36B]/30 bg-[#B7F36B]/12 text-[#F3F5F2]'
                : 'mr-2 border border-[#252B28] bg-[#1D221F] text-[#F3F5F2]'
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#727B74]">
                {msg.role === 'user' ? 'You' : `${msg.providerUsed ?? 'ApexFit Coach'}`}
              </span>
              {msg.role === 'assistant' && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(msg.content);
                    showToast('Copied response', 'info');
                  }}
                  aria-label="Copy response"
                  className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] text-[#727B74] hover:text-[#F3F5F2]"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              )}
            </div>

            <FormattedCoachText text={msg.content} />

            {msg.contextUsed && msg.contextUsed.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1 border-t border-[#252B28] pt-2">
                {msg.contextUsed.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#171A18] px-2 py-0.5 text-[10px] text-[#727B74]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Inline Apply / Cancel Confirmation Card */}
            {msg.proposedAction && !dismissedActions[msg.id] && (
              <div className="mt-3 rounded-2xl border border-[#303832] bg-[#171A18] p-2.5">
                {msg.actionApplied ? (
                  <Badge tone="success">
                    <Check className="h-3 w-3" />
                    Applied
                  </Badge>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-[#F3F5F2]">
                      {msg.proposedAction.label}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleApplyInlineAction(msg)}>
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDismissedActions((p) => ({ ...p, [msg.id]: true }))
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="mr-2 rounded-2xl border border-[#252B28] bg-[#1D221F] p-3.5 text-xs text-[#F3F5F2]">
            <div className="mb-1.5 flex items-center gap-2 text-[#B7F36B]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Processing request...
              </span>
            </div>
            {streamingText && <FormattedCoachText text={streamingText} />}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendPrompt(input);
        }}
        className="flex gap-2 pt-1"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask or command ${mode} coach...`}
          className="min-h-[46px] flex-1 rounded-2xl border border-[#303832] bg-[#1D221F] px-3.5 text-sm text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
        />
        <Button type="submit" disabled={!input.trim() || isSending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {/* Conversation History Modal */}
      <ModalShell
        isOpen={historyOpen}
        title="Conversations"
        subtitle={`${conversations.length} saved threads`}
        variant="sheet"
        onClose={() => setHistoryOpen(false)}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleNewConversation}>
              <MessageSquarePlus className="h-4 w-4" />
              New Chat
            </Button>
            <Button variant="secondary" onClick={handleClearConversation} disabled={!resolvedConvId}>
              Clear Thread
            </Button>
          </div>

          {renamingConv && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!renameTitle.trim()) return;
                await db.coachConversations.update(renamingConv.id, {
                  title: renameTitle.trim(),
                  updatedAt: new Date().toISOString(),
                });
                setRenamingConv(null);
                showToast('Renamed conversation', 'success');
              }}
              className="flex gap-2 rounded-2xl border border-[#303832] bg-[#1D221F] p-2.5"
            >
              <input
                type="text"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                className="min-h-[40px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-3 text-xs text-[#F3F5F2]"
                autoFocus
              />
              <Button type="submit" size="sm">
                Save
              </Button>
            </form>
          )}

          <div className="space-y-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`flex items-center justify-between gap-2 rounded-2xl border p-3 ${
                  conv.id === resolvedConvId
                    ? 'border-[#B7F36B]/40 bg-[#B7F36B]/10'
                    : 'border-[#252B28] bg-[#1D221F]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveConvId(conv.id);
                    setMode(conv.mode);
                    setHistoryOpen(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-semibold text-[#F3F5F2]">{conv.title}</p>
                  <p className="text-[11px] text-[#727B74]">
                    {conv.mode} • {conv.updatedAt.slice(0, 10)}
                  </p>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingConv(conv);
                      setRenameTitle(conv.title);
                    }}
                    aria-label={`Rename ${conv.title}`}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl text-[#A1AAA3] hover:text-[#F3F5F2]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(conv.id)}
                    aria-label={`Delete ${conv.title}`}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl text-[#727B74] hover:text-[#E87979]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ModalShell>

      {/* AI Memory Manager Modal */}
      <ModalShell
        isOpen={memoryOpen}
        title="Personal AI Memory"
        subtitle="Inspect, edit, or delete coach context"
        variant="sheet"
        onClose={() => setMemoryOpen(false)}
      >
        <div className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['all', ...MEMORY_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setMemFilter(cat)}
                className={`min-h-[32px] shrink-0 rounded-full px-3 text-[11px] font-semibold capitalize ${
                  memFilter === cat
                    ? 'bg-[#B7F36B] text-[#101211]'
                    : 'border border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <form
            onSubmit={handleSaveMemory}
            className="space-y-2 rounded-2xl border border-[#303832] bg-[#1D221F] p-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={memCat}
                onChange={(e) => setMemCat(e.target.value as MemoryCategory)}
                className="!min-h-[38px] text-xs"
              >
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Input
                value={memKey}
                onChange={(e) => setMemKey(e.target.value)}
                placeholder="Topic key"
                className="!min-h-[38px] text-xs"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={memContent}
                onChange={(e) => setMemContent(e.target.value)}
                placeholder="e.g. Prefers Bengali fish lunches"
                className="min-h-[40px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-3 text-xs text-[#F3F5F2]"
              />
              <Button type="submit" size="sm">
                <Plus className="h-3.5 w-3.5" />
                {editingMemory ? 'Update' : 'Add'}
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {filteredMemories.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={m.confidence === 'verified' ? 'lime' : 'info'}>
                      {m.category}
                    </Badge>
                    <span className="text-[10px] text-[#727B74]">{m.confidence}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMemory(m);
                        setMemCat(m.category);
                        setMemKey(m.key);
                        setMemContent(m.content);
                      }}
                      aria-label={`Edit memory ${m.key}`}
                      className="text-[#A1AAA3] hover:text-[#B7F36B]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteMemory(m.id);
                        showToast('Deleted memory', 'info');
                      }}
                      aria-label={`Delete memory ${m.key}`}
                      className="text-[#727B74] hover:text-[#E87979]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-[#F3F5F2]">{m.content}</p>
              </div>
            ))}
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
