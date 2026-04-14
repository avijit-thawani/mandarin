import { useEffect, useRef, useCallback, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';

interface ChatPageProps {
  store: VocabularyStore;
  userName?: string;
}

const CHAT_STORAGE_KEY = 'langseed_chat_history';
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

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export function ChatPage({ store, userName }: ChatPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const processedTools = useRef(new Set<string>());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [input, setInput] = useState('');
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/.netlify/functions/chat',
      body: { vocabContext: buildVocabContext(store) },
    }),
    messages: loadStoredMessages(),
  });

  // Process tool invocations from messages and apply to store
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        if (part.type.startsWith('tool-') && 'result' in part) {
          const toolPart = part as { type: string; toolCallId: string; args: Record<string, unknown>; result: Record<string, unknown> };
          const toolKey = `${msg.id}-${toolPart.toolCallId}`;
          if (processedTools.current.has(toolKey)) continue;
          processedTools.current.add(toolKey);

          if (toolPart.result?.status !== 'pending_client') continue;
          handleToolResult(toolPart.result, toolPart.args);
        }
      }
    }
  }, [messages]);

  const handleToolResult = useCallback(async (
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
          await store.addCustomWord(word, pinyin, meaning, part_of_speech, category);
          showToast(`Added ${word} (${pinyin}) to your study set`);
          break;
        }
        case 'unpause_words': {
          const { words } = args as { words: string[] };
          let count = 0;
          for (const w of words) {
            const concept = store.getConceptByWord(w);
            if (concept?.paused) {
              store.togglePaused(concept.id);
              count++;
            }
          }
          if (count > 0) showToast(`Activated ${count} word${count > 1 ? 's' : ''}`);
          break;
        }
        case 'pause_words': {
          const { words } = args as { words: string[] };
          let count = 0;
          for (const w of words) {
            const concept = store.getConceptByWord(w);
            if (concept && !concept.paused) {
              store.togglePaused(concept.id);
              count++;
            }
          }
          if (count > 0) showToast(`Paused ${count} word${count > 1 ? 's' : ''}`);
          break;
        }
        case 'delete_words': {
          const { words } = args as { words: string[] };
          let count = 0;
          for (const w of words) {
            try {
              await store.deleteCustomWord(w);
              count++;
            } catch {
              showToast(`Failed to delete ${w}`, 'error');
            }
          }
          if (count > 0) showToast(`Deleted ${count} word${count > 1 ? 's' : ''}`);
          break;
        }
      }
    } catch (err) {
      showToast(`Action failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    }
  }, [store, showToast]);

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
  }, [messages, status]);

  const handleClear = () => {
    setMessages([]);
    processedTools.current.clear();
    localStorage.removeItem(CHAT_STORAGE_KEY);
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
                  const toolPart = part as { type: string; toolCallId?: string; args?: Record<string, unknown>; result?: Record<string, unknown> };
                  return (
                    <ToolCard
                      key={i}
                      toolName={part.type.replace('tool-', '')}
                      args={toolPart.args || {}}
                      result={toolPart.result || null}
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

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 space-y-2">
          {toasts.map(t => (
            <div key={t.id} className={`alert ${t.type === 'success' ? 'alert-success' : 'alert-error'} py-2 px-4 shadow-lg`}>
              <span className="text-sm">{t.message}</span>
            </div>
          ))}
        </div>
      )}

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

function ToolCard({ toolName, args, result }: {
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown> | null;
}) {
  const labels: Record<string, string> = {
    add_custom_word: 'Add Word',
    unpause_words: 'Activate Words',
    pause_words: 'Pause Words',
    delete_words: 'Delete Words',
  };

  const icons: Record<string, string> = {
    add_custom_word: '➕',
    unpause_words: '▶️',
    pause_words: '⏸️',
    delete_words: '🗑️',
  };

  return (
    <div className="my-2 p-3 bg-base-300/50 rounded-xl border border-base-300">
      <div className="flex items-center gap-2 mb-1">
        <span>{icons[toolName] || '🔧'}</span>
        <span className="text-xs font-semibold">{labels[toolName] || toolName}</span>
        {result && (
          <span className="badge badge-xs badge-success ml-auto">done</span>
        )}
      </div>
      <div className="text-xs text-base-content/70">
        {toolName === 'add_custom_word' && (
          <span>{(args.word as string)} ({(args.pinyin as string)}) — {(args.meaning as string)}</span>
        )}
        {(toolName === 'unpause_words' || toolName === 'pause_words' || toolName === 'delete_words') && (
          <span>{(args.words as string[])?.join(', ')}</span>
        )}
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
