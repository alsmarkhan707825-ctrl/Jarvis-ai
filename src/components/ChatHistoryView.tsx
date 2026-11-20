import React, { useEffect, useState } from 'react';
import {
  Brain,
  Check,
  Download,
  Edit3,
  MessageSquare,
  MessageSquarePlus,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  ConversationThread,
  MemoryCategory,
  MemoryEntry,
  PersonalityId,
} from '../types/jarvis';

interface ChatHistoryViewProps {
  activePersonality: PersonalityId;
  activeThreadId: string | null;
  onSelectThread: (thread: ConversationThread) => void;
  onNewChat: (personality: PersonalityId) => void;
}

const PERSONALITY_TABS: Array<{ id: PersonalityId; label: string }> = [
  { id: 'jarvis', label: 'JARVIS' },
  { id: 'normal', label: 'Normal' },
  { id: 'jadavis', label: 'JADAVIS' },
  { id: 'girl', label: 'AI Girl' },
];

const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  personal_preference: 'Personal Preference',
  important_info: 'Important Information',
  conversation_history: 'Conversation History',
  important_event: 'Important Event',
  user_instruction: 'User Instruction',
  frequent_command: 'Frequent Command',
  character_memory: 'Character Memory',
  conversation_context: 'Conversation Context',
};

export const ChatHistoryView: React.FC<ChatHistoryViewProps> = ({
  activePersonality,
  activeThreadId,
  onSelectThread,
  onNewChat,
}) => {
  const [filterPersonality, setFilterPersonality] = useState<PersonalityId>(activePersonality);
  const [subTab, setSubTab] = useState<'chats' | 'memory'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [memKey, setMemKey] = useState('');
  const [memValue, setMemValue] = useState('');
  const [memCategory, setMemCategory] = useState<MemoryCategory>('important_info');
  const [memApproved, setMemApproved] = useState(false);
  const [memError, setMemError] = useState<string | null>(null);
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingMemVal, setEditingMemVal] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [convResp, memResp] = await Promise.all([
        fetch(`/api/conversations?personality=${filterPersonality}&q=${encodeURIComponent(searchQuery)}`),
        fetch(`/api/memory?personality=${filterPersonality}&q=${encodeURIComponent(memorySearchQuery)}`),
      ]);
      if (convResp.ok) setThreads(await convResp.json());
      if (memResp.ok) setMemories(await memResp.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [filterPersonality, searchQuery, memorySearchQuery]);

  const personalityDisplayName =
    PERSONALITY_TABS.find((p) => p.id === filterPersonality)?.label || 'JARVIS';

  const handleRename = async (id: string) => {
    if (!editingTitle.trim()) {
      setEditingId(null);
      return;
    }
    const resp = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editingTitle }),
    });
    if (resp.ok) {
      setEditingId(null);
      await loadData();
    }
  };

  const handleDeleteThread = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemError(null);
    if (!memApproved) {
      setMemError('Please confirm permission before storing personal memory.');
      return;
    }
    if (!memKey.trim() || !memValue.trim()) {
      setMemError('Both label and detail are required.');
      return;
    }
    const resp = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personality: filterPersonality,
        category: memCategory,
        key: memKey,
        value: memValue,
        userApproved: memApproved,
      }),
    });
    const data = (await resp.json()) as { error?: string };
    if (!resp.ok) {
      setMemError(data.error || 'Failed to save memory.');
      return;
    }
    setMemKey('');
    setMemValue('');
    setMemApproved(false);
    await loadData();
  };

  const handleSaveMemoryEdit = async (id: string) => {
    if (!editingMemVal.trim()) return;
    await fetch(`/api/memory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: editingMemVal }),
    });
    setEditingMemId(null);
    await loadData();
  };

  const handleDeleteMemory = async (id: string) => {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const handleExportMemory = async () => {
    const resp = await fetch(`/api/memory/export?personality=${filterPersonality}`);
    if (!resp.ok) return;
    const text = await resp.text();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-memory-${filterPersonality}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pb-24 pt-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white tracking-tight">
            History & Memory
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Independent conversation logs and 8-category long-term memories per AI character.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNewChat(filterPersonality)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium border border-amber-400/25 transition-colors whitespace-nowrap"
        >
          <MessageSquarePlus className="w-4 h-4" />
          New {personalityDisplayName} Chat
        </button>
      </div>

      {/* Personality & Section Segmented Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="inline-flex p-1 rounded-xl bg-[#09132d] border border-blue-900/60">
          {PERSONALITY_TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setFilterPersonality(tabItem.id)}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                filterPersonality === tabItem.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div className="inline-flex p-1 rounded-xl bg-[#09132d] border border-blue-900/60">
          <button
            type="button"
            onClick={() => setSubTab('chats')}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'chats' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Conversations
          </button>
          <button
            type="button"
            onClick={() => setSubTab('memory')}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'memory' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            Stored Memory
          </button>
        </div>
      </div>

      {subTab === 'chats' ? (
        <div>
          <div className="relative mb-5">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${personalityDisplayName} conversations...`}
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#09132d] border border-blue-900/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading conversation history...</div>
          ) : threads.length === 0 ? (
            <div className="py-12 text-center rounded-2xl bg-[#09132d]/60 border border-blue-900/40 px-4">
              <p className="text-sm text-slate-300">No saved conversations yet for {personalityDisplayName}.</p>
              <p className="text-xs text-slate-500 mt-1">
                Start speaking or typing on the Home screen to create a session.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-blue-900/40 rounded-2xl bg-[#09132d]/70 border border-blue-900/50 overflow-hidden">
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                const lastMsg = thread.messages[thread.messages.length - 1];
                return (
                  <div
                    key={thread.id}
                    className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                      isActive ? 'bg-blue-950/60' : 'hover:bg-blue-950/30'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      {editingId === thread.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && void handleRename(thread.id)}
                            className="flex-1 h-9 px-3 rounded-lg bg-[#040918] border border-blue-500 text-sm text-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void handleRename(thread.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-blue-600 text-white"
                            aria-label="Save title"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectThread(thread)}
                          className="text-left w-full group"
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                            <span className="truncate">{thread.title}</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                            <span className="tabular-nums">{thread.messages.length} messages</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {new Date(thread.updatedAt).toLocaleDateString()}
                            </span>
                            {lastMsg && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate max-w-[260px] text-slate-500">
                                  {lastMsg.content}
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(thread.id);
                          setEditingTitle(thread.title);
                        }}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-blue-900/40 transition-colors"
                        aria-label="Rename conversation"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteThread(thread.id)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Search & Export Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={memorySearchQuery}
                onChange={(e) => setMemorySearchQuery(e.target.value)}
                placeholder={`Search ${personalityDisplayName} memory by keyword or topic...`}
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#09132d] border border-blue-900/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleExportMemory()}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#09132d] hover:bg-blue-950/70 border border-blue-800/60 text-xs font-medium text-amber-300 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>

          <form
            onSubmit={handleAddMemory}
            className="rounded-2xl bg-[#09132d]/70 border border-blue-900/50 p-5 space-y-4"
          >
            <h2 className="text-sm font-semibold text-white">Save New User-Approved Memory</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={memCategory}
                onChange={(e) => setMemCategory(e.target.value as MemoryCategory)}
                className="h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {(Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {MEMORY_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={memKey}
                onChange={(e) => setMemKey(e.target.value)}
                placeholder="Label (e.g. Preferred Language)"
                className="h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={memValue}
                onChange={(e) => setMemValue(e.target.value)}
                placeholder="Detail to remember"
                className="h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={memApproved}
                  onChange={(e) => setMemApproved(e.target.checked)}
                  className="w-4 h-4 rounded border-blue-700 bg-[#040918] text-blue-600"
                />
                I grant explicit permission to store this memory for {personalityDisplayName}.
              </label>

              <button
                type="submit"
                className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
              >
                Save Memory
              </button>
            </div>
            {memError && <p className="text-xs text-red-400">{memError}</p>}
          </form>

          <div className="divide-y divide-blue-900/40 rounded-2xl bg-[#09132d]/70 border border-blue-900/50 overflow-hidden">
            {memories.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No memories stored for {personalityDisplayName}.
              </div>
            ) : (
              memories.map((mem) => (
                <div key={mem.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-amber-300">
                      <span>{mem.key}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-400">
                        {MEMORY_CATEGORY_LABELS[mem.category] || mem.category.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {editingMemId === mem.id ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingMemVal}
                          onChange={(e) => setEditingMemVal(e.target.value)}
                          className="flex-1 h-9 px-3 rounded-lg bg-[#040918] border border-blue-500 text-sm text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveMemoryEdit(mem.id)}
                          className="min-h-[36px] px-3 rounded-lg bg-blue-600 text-xs text-white font-medium"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-200 mt-1 leading-relaxed">{mem.value}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMemId(mem.id);
                        setEditingMemVal(mem.value);
                      }}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-blue-900/40 transition-colors"
                      aria-label="Edit memory"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMemory(mem.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      aria-label="Delete memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
