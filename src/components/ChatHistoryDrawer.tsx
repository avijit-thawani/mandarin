import { useEffect, useRef, useState } from 'react';
import { Plus, X, Trash2, Pencil, MessageSquare, Check } from 'lucide-react';
import { groupConversations, type ConversationSummary } from '../lib/chatHistoryService';
import { haptic } from '../services/hapticService';

interface ChatHistoryDrawerProps {
  open: boolean;
  conversations: ConversationSummary[];
  activeId: string | null;
  loading?: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

// Horizontal drag (px) that counts as a swipe-to-close rather than a tap.
const SWIPE_CLOSE_THRESHOLD = 60;

export function ChatHistoryDrawer({
  open,
  conversations,
  activeId,
  loading,
  onClose,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
}: ChatHistoryDrawerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Reset transient row state whenever the drawer is dismissed.
  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setConfirmDeleteId(null);
    }
  }, [open]);

  // Hardware/browser back and Escape should close the drawer, not leave the tab.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const groups = groupConversations(conversations);

  const startEditing = (c: ConversationSummary) => {
    haptic('tap');
    setConfirmDeleteId(null);
    setEditingId(c.id);
    setDraftTitle(c.title || '');
  };

  const commitEditing = () => {
    if (editingId) {
      const trimmed = draftTitle.trim();
      if (trimmed) onRename(editingId, trimmed);
    }
    setEditingId(null);
  };

  return (
    <>
      {/* Backdrop: tap anywhere to dismiss. Rendered only when open so it never
          swallows taps meant for the chat input. */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-[70] w-[85%] max-w-xs bg-base-100 border-r border-base-300
                    flex flex-col shadow-xl transition-transform duration-200 ease-out
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Chat history"
        aria-hidden={!open}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchStartX.current === null) return;
          if (touchStartX.current - e.changedTouches[0].clientX > SWIPE_CLOSE_THRESHOLD) onClose();
          touchStartX.current = null;
        }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-3 border-b border-base-300">
          <span className="font-bold">Chats</span>
          <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose} aria-label="Close chat history">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-shrink-0 p-3">
          <button
            className="btn btn-primary btn-sm w-full gap-2"
            onClick={() => { haptic('tap'); onNewChat(); }}
          >
            <Plus className="w-4 h-4" />
            New chat
          </button>
        </div>

        {/* Scrolls independently; bottom padding clears the fixed navbar. */}
        <div className="flex-1 overflow-y-auto px-2 pb-20">
          {loading && (
            <p className="text-xs text-base-content/50 px-2 py-3">Loading...</p>
          )}

          {!loading && conversations.length === 0 && (
            <p className="text-xs text-base-content/50 px-2 py-3">
              No past chats yet. Your conversations will show up here.
            </p>
          )}

          {groups.map(group => (
            <div key={group.label} className="mb-3">
              <p className="text-[10px] uppercase tracking-wide text-base-content/40 px-2 mb-1">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(c => {
                  const isActive = c.id === activeId;

                  if (editingId === c.id) {
                    return (
                      <li key={c.id} className="flex items-center gap-1 px-1">
                        <input
                          autoFocus
                          className="input input-xs input-bordered flex-1 min-w-0"
                          value={draftTitle}
                          onChange={e => setDraftTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEditing();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          className="btn btn-xs btn-ghost btn-circle"
                          onClick={commitEditing}
                          aria-label="Save title"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li key={c.id}>
                      <div
                        className={`flex items-center rounded-lg ${
                          isActive ? 'bg-base-300' : 'active:bg-base-200'
                        }`}
                      >
                        <button
                          className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2.5 text-left"
                          onClick={() => { haptic('tap'); onSelect(c.id); }}
                        >
                          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-base-content/40" />
                          <span className="truncate text-sm">{c.title || 'New chat'}</span>
                        </button>

                        {/* Always-visible actions: there is no hover on touch. */}
                        <button
                          className="btn btn-xs btn-ghost btn-circle flex-shrink-0"
                          onClick={() => startEditing(c)}
                          aria-label="Rename chat"
                        >
                          <Pencil className="w-3.5 h-3.5 text-base-content/40" />
                        </button>
                        <button
                          className={`btn btn-xs btn-ghost btn-circle flex-shrink-0 mr-1 ${
                            confirmDeleteId === c.id ? 'text-error' : 'text-base-content/40'
                          }`}
                          onClick={() => {
                            haptic('tap');
                            if (confirmDeleteId === c.id) {
                              onDelete(c.id);
                              setConfirmDeleteId(null);
                            } else {
                              // Two taps to delete — no room for a modal on mobile.
                              setConfirmDeleteId(c.id);
                            }
                          }}
                          aria-label={confirmDeleteId === c.id ? 'Confirm delete chat' : 'Delete chat'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {confirmDeleteId === c.id && (
                        <p className="text-[10px] text-error px-2 pb-1">Tap again to delete</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
