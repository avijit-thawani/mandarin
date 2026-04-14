import { useEffect, useRef, useCallback, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import { supabase } from '../lib/supabase';

interface ChatPageProps {
  store: VocabularyStore;
  userName?: string;
}

const CHAT_STORAGE_KEY = 'langseed_chat_history';
const TOOL_RESULTS_KEY = 'langseed_tool_results';
const PROCESSED_TOOLS_KEY = 'langseed_processed_tools';
const MAX_STORED_MESSAGES = 50;

function buildVocabContext(store: VocabularyStore): string {
  const active = store.concepts.filter(c => !c.paused);
  const paused = store.concepts.filter(c => c.paused);

  const confident = active.filter(c => c.knowledge > 80);
  const learning = active.filter(c => c.knowledge >= 50 && c.knowledge <= 80);
  const weak = active.filter(c => c.knowledge < 50);

  const fmt = (c: { word: string; pinyin: string; meaning: string; knowledge: number }) =>
    `${c.word}|${c.pinyin}|${c.meaning}|${c.knowledge}`;

  const lines: string[] = [];
  lines.push(`ACTIVE (${active.length} words):`);
  if (confident.length) {
    lines.push(`\nConfident (>80):`);
    lines.push(confident.map(fmt).join('\n'));
  }
  if (learning.length) {
    lines.push(`\nLearning (50-80):`);
    lines.push(learning.map(fmt).join('\n'));
  }
  if (weak.length) {
    lines.push(`\nWeak (<50):`);
    lines.push(weak.map(fmt).join('\n'));
  }
  if (paused.length) {
    lines.push(`\nPAUSED (${paused.length} words):`);
    lines.push(paused.map(c => c.word).join(', '));
  }
  return lines.join('\n');
}

// Tracks the real client-side execution result for each tool call
interface ToolExecResult {
  status: 'success' | 'error';
  summary: string;
}

export function ChatPage({ store, userName }: ChatPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const processedTools = useRef(loadProcessedTools());
  const [input, setInput] = useState('');
  const [toolResults, setToolResults] = useState<Record<string, ToolExecResult>>(loadToolResults);

  const recordToolExec = useCallback((toolCallId: string, result: ToolExecResult) => {
    setToolResults(prev => {
      const next = { ...prev, [toolCallId]: result };
      try { localStorage.setItem(TOOL_RESULTS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/.netlify/functions/chat',
      headers: async (): Promise<Record<string, string>> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return {};
        return { Authorization: `Bearer ${session.access_token}` };
      },
      body: () => ({ vocabContext: buildVocabContext(store) }),
    }),
    messages: loadStoredMessages(),
  });

  // Process tool invocations from messages and apply to store
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        if (part.type.startsWith('tool-') && 'output' in part) {
          const toolPart = part as { type: string; toolCallId: string; state: string; input?: Record<string, unknown>; output?: Record<string, unknown> };
          if (toolPart.state !== 'output-available') continue;
          const toolKey = `${msg.id}-${toolPart.toolCallId}`;
          if (processedTools.current.has(toolKey)) continue;
          processedTools.current.add(toolKey);
          try { localStorage.setItem(PROCESSED_TOOLS_KEY, JSON.stringify([...processedTools.current])); } catch { /* quota */ }

          if (toolPart.output?.status !== 'pending_client') continue;
          handleToolResult(toolPart.toolCallId, toolPart.output, toolPart.input || {});
        }
      }
    }
  }, [messages]);

  const handleToolResult = useCallback(async (
    toolCallId: string,
    result: Record<string, unknown>,
    args: Record<string, unknown>,
  ) => {
    const action = result.action as string;

    try {
      switch (action) {
        case 'add_custom_word': {
          const { word, pinyin, meaning, part_of_speech, category } = args as {
            word: string; pinyin: string; meaning: string; part_of_speech: string; category?: string;
          };
          const existing = store.getConceptByWord(word as string);
          if (existing) {
            recordToolExec(toolCallId, {
              status: 'error',
              summary: `${word} already exists (${existing.paused ? 'paused' : 'active'}) — use ${existing.paused ? 'unpause' : 'pause'} instead`,
            });
            break;
          }
          await store.addCustomWord(word, pinyin, meaning, part_of_speech, category);
          recordToolExec(toolCallId, {
            status: 'success',
            summary: `Added ${word} (${pinyin}) "${meaning}" — now in your quizzes`,
          });
          break;
        }
        case 'unpause_words': {
          const { words } = args as { words: string[] };
          const activated: string[] = [];
          const problems: string[] = [];
          for (const w of words) {
            const concept = store.getConceptByWord(w);
            if (concept?.paused) {
              store.togglePaused(concept.id);
              activated.push(`${w} (${concept.pinyin})`);
            } else if (!concept) {
              problems.push(`${w} not found in vocab`);
            } else {
              problems.push(`${w} was already active`);
            }
          }
          const parts: string[] = [];
          if (activated.length) parts.push(`Activated: ${activated.join(', ')}`);
          if (problems.length) parts.push(`Skipped: ${problems.join('; ')}`);
          recordToolExec(toolCallId, {
            status: problems.length && !activated.length ? 'error' : 'success',
            summary: parts.join(' | '),
          });
          break;
        }
        case 'pause_words': {
          const { words } = args as { words: string[] };
          const paused: string[] = [];
          const problems: string[] = [];
          for (const w of words) {
            const concept = store.getConceptByWord(w);
            if (concept && !concept.paused) {
              store.togglePaused(concept.id);
              paused.push(`${w} (${concept.pinyin})`);
            } else if (!concept) {
              problems.push(`${w} not found in vocab`);
            } else {
              problems.push(`${w} was already paused`);
            }
          }
          const parts: string[] = [];
          if (paused.length) parts.push(`Paused: ${paused.join(', ')}`);
          if (problems.length) parts.push(`Skipped: ${problems.join('; ')}`);
          recordToolExec(toolCallId, {
            status: problems.length && !paused.length ? 'error' : 'success',
            summary: parts.join(' | '),
          });
          break;
        }
        case 'delete_words': {
          const { words } = args as { words: string[] };
          const deleted: string[] = [];
          const problems: string[] = [];
          for (const w of words) {
            try {
              await store.deleteCustomWord(w);
              deleted.push(w);
            } catch {
              problems.push(`${w} — not a custom word`);
            }
          }
          const parts: string[] = [];
          if (deleted.length) parts.push(`Deleted: ${deleted.join(', ')}`);
          if (problems.length) parts.push(`Failed: ${problems.join('; ')}`);
          recordToolExec(toolCallId, {
            status: problems.length && !deleted.length ? 'error' : 'success',
            summary: parts.join(' | '),
          });
          break;
        }
        case 'get_vocab_status': {
          const { words } = args as { words: string[] };
          const statuses: string[] = [];
          for (const w of words) {
            const concept = store.getConceptByWord(w);
            if (!concept) {
              statuses.push(`${w} — not in vocab`);
            } else if (concept.paused) {
              statuses.push(`${w} (${concept.pinyin}) — paused`);
            } else {
              statuses.push(`${w} (${concept.pinyin}) — active, knowledge ${concept.knowledge}%`);
            }
          }
          recordToolExec(toolCallId, {
            status: 'success',
            summary: statuses.join('\n'),
          });
          break;
        }
        default:
          recordToolExec(toolCallId, { status: 'error', summary: `Unknown action: ${action}` });
      }
    } catch (err) {
      recordToolExec(toolCallId, {
        status: 'error',
        summary: `Failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    }
  }, [store, recordToolExec]);

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        const trimmed = messages.slice(-MAX_STORED_MESSAGES);
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
      } catch { /* quota exceeded */ }
    }
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, toolResults]);

  const handleClear = () => {
    setMessages([]);
    processedTools.current.clear();
    setToolResults({});
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(TOOL_RESULTS_KEY);
    localStorage.removeItem(PROCESSED_TOOLS_KEY);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessage({ text });
  };

  const isStreaming = status === 'streaming';
  const isLoading = status === 'submitted';

  const welcomeMessage = userName
    ? `Hi ${userName}! I'm Saras — ask me anything about Mandarin, practice conversation, or explore new words. I can add them to your study set or remove them, just say the word.`
    : `Hi! I'm Saras — ask me anything about Mandarin, practice conversation, or explore new words. I can add them to your study set or remove them, just say the word.`;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Chat</h1>
          <p className="text-sm text-base-content/60">
            {store.studyingCount} words active
          </p>
        </div>
        {messages.length > 0 && (
          <button
            className="btn btn-sm btn-ghost gap-1 text-base-content/50"
            onClick={handleClear}
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="bg-base-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
              <p className="text-sm whitespace-pre-wrap">{welcomeMessage}</p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-2xl px-4 py-3 max-w-[85%] ${
              msg.role === 'user'
                ? 'bg-primary text-primary-content rounded-tr-sm'
                : 'bg-base-200 rounded-tl-sm'
            }`}>
              {msg.parts.map((part, i) => {
                if (part.type === 'text') {
                  return <p key={i} className="text-sm whitespace-pre-wrap">{part.text}</p>;
                }
                if (part.type.startsWith('tool-')) {
                  const toolPart = part as { type: string; toolCallId?: string; state?: string; input?: Record<string, unknown>; output?: Record<string, unknown> };
                  const execResult = toolPart.toolCallId ? toolResults[toolPart.toolCallId] : undefined;
                  return (
                    <ToolCard
                      key={i}
                      toolName={part.type.replace('tool-', '')}
                      args={toolPart.input || {}}
                      serverDone={toolPart.state === 'output-available'}
                      execResult={execResult}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {(isStreaming || isLoading) && (
          <div className="flex justify-start">
            <div className="bg-base-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-base-content/50" />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="alert alert-error py-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error.message}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-base-300 bg-base-100 p-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          className="textarea textarea-bordered flex-1 min-h-[44px] max-h-32 resize-none text-sm"
          placeholder="Ask about Mandarin..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && !isStreaming && !isLoading) {
                handleSend();
              }
            }
          }}
          rows={1}
          disabled={isStreaming || isLoading}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm h-[44px]"
          disabled={!input.trim() || isStreaming || isLoading}
          onClick={handleSend}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ToolCard({ toolName, args, serverDone, execResult }: {
  toolName: string;
  args: Record<string, unknown>;
  serverDone: boolean;
  execResult?: ToolExecResult;
}) {
  const icons: Record<string, string> = {
    add_custom_word: '➕',
    unpause_words: '▶️',
    pause_words: '⏸️',
    delete_words: '🗑️',
    get_vocab_status: '🔍',
  };

  const wordSummary = toolName === 'add_custom_word'
    ? `${args.word} (${args.pinyin}) — ${args.meaning}`
    : (args.words as string[])?.join(', ');

  // Three states: waiting for server, waiting for client exec, client exec done
  let borderClass = 'bg-base-300/50 border-base-300';
  let statusLine = 'Waiting for response...';

  if (serverDone && !execResult) {
    statusLine = 'Applying change...';
  } else if (execResult?.status === 'success') {
    borderClass = 'bg-success/10 border-success/30';
    statusLine = execResult.summary;
  } else if (execResult?.status === 'error') {
    borderClass = 'bg-error/10 border-error/30';
    statusLine = execResult.summary;
  }

  return (
    <div className={`my-2 p-3 rounded-xl border ${borderClass}`}>
      <div className="flex items-center gap-2 mb-1">
        <span>{icons[toolName] || '🔧'}</span>
        {wordSummary && (
          <span className="text-xs font-medium">{wordSummary}</span>
        )}
      </div>
      <div className={`text-xs ml-6 ${
        execResult?.status === 'error' ? 'text-error' :
        execResult?.status === 'success' ? 'text-success' :
        'text-base-content/50'
      }`}>
        {statusLine}
      </div>
    </div>
  );
}

function loadStoredMessages() {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function loadToolResults(): Record<string, ToolExecResult> {
  try {
    const stored = localStorage.getItem(TOOL_RESULTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function loadProcessedTools(): Set<string> {
  try {
    const stored = localStorage.getItem(PROCESSED_TOOLS_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch { /* ignore */ }
  return new Set();
}
