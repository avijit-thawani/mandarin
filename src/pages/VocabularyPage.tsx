import { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, CheckSquare, Square, Filter, HelpCircle, Check, Loader2, AlertTriangle, Cloud, RefreshCw } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { Concept } from '../types/vocabulary';
import { VocabCard } from '../components/VocabCard';

interface VocabularyPageProps {
  store: VocabularyStore;
  settingsStore?: SettingsStore;
  onSync?: () => void;
  onShowHelp?: () => void;
  onRefresh?: () => Promise<void>;
  isGuest?: boolean;
}

type SortField = 'pinyin' | 'word' | 'meaning' | 'part_of_speech' | 'chapter' | 'knowledge';
type SortDir = 'asc' | 'desc';

const VOCAB_PREFS_KEY = 'langseed_vocab_prefs';

interface VocabPreferences {
  sortField: SortField;
  sortDir: SortDir;
  filterChapter: string;
  filterPoS: string;
  showStudyingOnly: boolean;
  includePhrases: boolean;
}

const DEFAULT_VOCAB_PREFS: VocabPreferences = {
  sortField: 'chapter',
  sortDir: 'asc',
  filterChapter: 'all',
  filterPoS: 'all',
  showStudyingOnly: false,
  includePhrases: true,
};

function loadVocabPreferences(): VocabPreferences {
  try {
    const stored = localStorage.getItem(VOCAB_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate and merge with defaults
      const validFields: SortField[] = ['pinyin', 'word', 'meaning', 'part_of_speech', 'chapter', 'knowledge'];
      const validDirs: SortDir[] = ['asc', 'desc'];
      
      return {
        sortField: validFields.includes(parsed.sortField) ? parsed.sortField : DEFAULT_VOCAB_PREFS.sortField,
        sortDir: validDirs.includes(parsed.sortDir) ? parsed.sortDir : DEFAULT_VOCAB_PREFS.sortDir,
        filterChapter: typeof parsed.filterChapter === 'string' ? parsed.filterChapter : DEFAULT_VOCAB_PREFS.filterChapter,
        filterPoS: typeof parsed.filterPoS === 'string' ? parsed.filterPoS : DEFAULT_VOCAB_PREFS.filterPoS,
        showStudyingOnly: typeof parsed.showStudyingOnly === 'boolean' ? parsed.showStudyingOnly : DEFAULT_VOCAB_PREFS.showStudyingOnly,
        includePhrases: typeof parsed.includePhrases === 'boolean' ? parsed.includePhrases : DEFAULT_VOCAB_PREFS.includePhrases,
      };
    }
  } catch {
    // Ignore parse errors, use defaults
  }
  return DEFAULT_VOCAB_PREFS;
}

function saveVocabPreferences(prefs: Partial<VocabPreferences>): void {
  try {
    const current = loadVocabPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(VOCAB_PREFS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

export function VocabularyPage({ store, settingsStore, onSync, onShowHelp, onRefresh, isGuest }: VocabularyPageProps) {
  const initialPrefs = loadVocabPreferences();
  const [sortField, setSortField] = useState<SortField>(initialPrefs.sortField);
  const [sortDir, setSortDir] = useState<SortDir>(initialPrefs.sortDir);
  const [filterChapter, setFilterChapter] = useState<string>(initialPrefs.filterChapter);
  const [filterPoS, setFilterPoS] = useState<string>(initialPrefs.filterPoS);
  const [showStudyingOnly, setShowStudyingOnly] = useState<boolean>(initialPrefs.showStudyingOnly);
  const [includePhrases, setIncludePhrases] = useState<boolean>(initialPrefs.includePhrases);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  
  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Auto-import HSK1 if no vocab exists (guest only — authenticated users get data from cloud)
  useEffect(() => {
    if (isGuest && store.concepts.length === 0 && store.hsk1Vocab.length > 0) {
      store.importChapters(1, 1, true);
    }
  }, [isGuest, store.concepts.length, store.hsk1Vocab.length, store.importChapters]);
  
  // Async refresh on mount (shows cached data immediately, syncs in background)
  // Only refresh if there are no local unsaved changes to avoid overwriting quiz results
  const handleRefresh = useCallback(async () => {
    if (!onRefresh || isRefreshing) return;
    // Don't overwrite local changes with cloud data
    if (store.hasUnsyncedChanges) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing, store.hasUnsyncedChanges]);
  
  // Auto-refresh when page mounts (only if no local changes)
  useEffect(() => {
    handleRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Get unique chapters (only positive, for HSK words; compounds have negative chapters)
  const chapters = useMemo(() => {
    return [...new Set(store.concepts.map(c => c.chapter))]
      .filter(ch => ch > 0)
      .sort((a, b) => a - b);
  }, [store.concepts]);

  // Per-chapter known/total stats for the chapter strip
  const chapterStats = useMemo(() => {
    const stats = new Map<number, { total: number; known: number }>();
    store.concepts.forEach(c => {
      if (c.chapter <= 0) return;
      const existing = stats.get(c.chapter) || { total: 0, known: 0 };
      existing.total++;
      if (!c.paused) existing.known++;
      stats.set(c.chapter, existing);
    });
    return stats;
  }, [store.concepts]);
  
  // Filter and sort concepts
  const filteredConcepts = useMemo(() => {
    let result = store.concepts;
    
    // Phrases toggle: filter out compound phrases (negative chapters) if disabled
    if (!includePhrases) {
      result = result.filter(c => c.chapter > 0);
    }
    
    // Chapter filter
    if (filterChapter !== 'all') {
      const selectedCh = parseInt(filterChapter);
      result = result.filter(c => {
        if (c.chapter > 0) {
          // HSK word: exact chapter match
          return c.chapter === selectedCh;
        } else {
          // Compound phrase: show if level (absolute value) <= selected chapter
          return Math.abs(c.chapter) <= selectedCh;
        }
      });
    }
    
    // PoS filter
    if (filterPoS !== 'all') {
      result = result.filter(c => c.part_of_speech === filterPoS);
    }
    
    // Known toggle: show only known words (not paused) if enabled
    if (showStudyingOnly) {
      result = result.filter(c => !c.paused);
    }
    
    return result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'pinyin':
          comparison = a.pinyin.localeCompare(b.pinyin);
          break;
        case 'word':
          comparison = a.word.localeCompare(b.word);
          break;
        case 'meaning':
          comparison = a.meaning.localeCompare(b.meaning);
          break;
        case 'part_of_speech':
          comparison = a.part_of_speech.localeCompare(b.part_of_speech);
          break;
        case 'chapter':
          // Sort by absolute value, then positives before negatives
          // Result: 1, 2, 3, -3, 4, -4, ... 15, -15
          const absA = Math.abs(a.chapter);
          const absB = Math.abs(b.chapter);
          if (absA !== absB) {
            comparison = absA - absB;
          } else {
            // Same absolute value: positive before negative
            comparison = (a.chapter > 0 ? 0 : 1) - (b.chapter > 0 ? 0 : 1);
          }
          break;
        case 'knowledge':
          comparison = a.knowledge - b.knowledge;
          break;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [store.concepts, filterChapter, filterPoS, showStudyingOnly, includePhrases, sortField, sortDir]);
  
  const handleSort = (field: SortField) => {
    let newDir: SortDir;
    if (sortField === field) {
      newDir = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(newDir);
    } else {
      newDir = 'asc';
      setSortField(field);
      setSortDir(newDir);
    }
    // Persist to localStorage
    saveVocabPreferences({ sortField: field, sortDir: newDir });
  };
  
  // Persist filter preferences
  const handleFilterChapter = (value: string) => {
    setFilterChapter(value);
    saveVocabPreferences({ filterChapter: value });
  };
  
  const handleFilterPoS = (value: string) => {
    setFilterPoS(value);
    saveVocabPreferences({ filterPoS: value });
  };
  
  const handleToggleStudyingOnly = () => {
    const newValue = !showStudyingOnly;
    setShowStudyingOnly(newValue);
    saveVocabPreferences({ showStudyingOnly: newValue });
  };
  
  const handleToggleIncludePhrases = () => {
    const newValue = !includePhrases;
    setIncludePhrases(newValue);
    saveVocabPreferences({ includePhrases: newValue });
  };

  const handleToggleChapter = (chapter: number) => {
    const stat = chapterStats.get(chapter);
    if (!stat) return;
    const allKnown = stat.known === stat.total;
    store.setChapterPaused(chapter, allKnown);
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    }
    return sortDir === 'asc' 
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />;
  };

  // Stats
  const knownCount = store.concepts.filter(c => !c.paused).length;
  const totalCount = store.concepts.length;
  const filteredCount = filteredConcepts.length;
  const filteredKnown = filteredConcepts.filter(c => !c.paused).length;
  
  // Mass toggle for filtered results
  const handleMarkAllKnown = () => {
    filteredConcepts.forEach(c => {
      if (c.paused) {
        store.togglePaused(c.id);
      }
    });
  };
  
  const handleMarkAllUnknown = () => {
    filteredConcepts.forEach(c => {
      if (!c.paused) {
        store.togglePaused(c.id);
      }
    });
  };
  
  // Format last sync time
  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };
  
  // Sync button state
  const getSyncButtonClass = () => {
    if (store.syncError) return 'btn-error';
    if (store.hasUnsyncedChanges) return 'btn-warning';
    return 'btn-success';
  };
  
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              Vocabulary
              {isRefreshing && (
                <span className="flex items-center gap-1 text-xs font-normal text-base-content/50">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  syncing
                </span>
              )}
            </h1>
            <p className="text-sm text-base-content/60">
              {totalCount} words · {knownCount} known{filteredCount !== totalCount && ` · ${filteredCount} shown`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onShowHelp && (
              <button
                className="btn btn-sm btn-ghost btn-circle text-base-content/50 hover:text-primary"
                onClick={onShowHelp}
                title="Help & Guide"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}
            {onSync && !isGuest && (
              <button
                className={`btn btn-sm gap-1 ${getSyncButtonClass()}`}
                onClick={store.syncError ? store.clearSyncError : onSync}
                disabled={store.isSyncing || (!store.hasUnsyncedChanges && !store.syncError)}
                title={store.syncError || `Last saved: ${formatTime(store.lastSyncTime)}`}
              >
                {store.isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : store.syncError ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Retry
                  </>
                ) : store.hasUnsyncedChanges ? (
                  <>
                    <Cloud className="w-4 h-4" />
                    Save
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Saved
                  </>
                )}
              </button>
            )}
            {isGuest && (
              <span className="badge badge-warning badge-outline gap-1">
                <span>Guest Mode</span>
              </span>
            )}
            {store.concepts.length === 0 && (
              <button 
                className="btn btn-sm btn-primary"
                onClick={store.importHSK1}
              >
                <Download className="w-4 h-4" />
                Import All
              </button>
            )}
          </div>
        </div>
        
        {/* Filters & Actions Row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-base-content/40 shrink-0" />
          
          {/* Chapter filter */}
          <select
            className="select select-xs select-bordered bg-base-200 w-auto"
            value={filterChapter}
            onChange={e => handleFilterChapter(e.target.value)}
          >
            <option value="all">Ch 1-{Math.max(...chapters, 1)}</option>
            {chapters.map(ch => (
              <option key={ch} value={ch}>Ch {ch}</option>
            ))}
          </select>
          
          {/* PoS filter */}
          <select
            className="select select-xs select-bordered bg-base-200 w-auto"
            value={filterPoS}
            onChange={e => handleFilterPoS(e.target.value)}
          >
            <option value="all">All PoS</option>
            <option value="noun">Noun</option>
            <option value="verb">Verb</option>
            <option value="adjective">Adjective</option>
            <option value="adverb">Adverb</option>
            <option value="pronoun">Pronoun</option>
            <option value="preposition">Preposition</option>
            <option value="conjunction">Conjunction</option>
            <option value="particle">Particle</option>
            <option value="numeral">Numeral</option>
            <option value="measure_word">Measure Word</option>
            <option value="other">Other</option>
          </select>
          
          {/* Textbook only toggle - excludes LLM-generated phrases */}
          <button
            className={`btn btn-xs gap-1 ${!includePhrases ? 'btn-primary' : 'btn-ghost'}`}
            onClick={handleToggleIncludePhrases}
            title={!includePhrases ? 'Showing textbook words only' : 'Click to hide generated phrases'}
          >
            <span className="hidden sm:inline">Only textbook</span>
            <span className="sm:hidden">Textbook</span>
          </button>
          
          {/* Known words toggle - shows only words user has marked as known */}
          <button
            className={`btn btn-xs gap-1 ${showStudyingOnly ? 'btn-primary' : 'btn-ghost'}`}
            onClick={handleToggleStudyingOnly}
            title={showStudyingOnly ? 'Showing only known words' : 'Click to show only known words'}
          >
            <span className="hidden sm:inline">Only known</span>
            <span className="sm:hidden">Known</span>
          </button>
          
          {/* Mass actions */}
          {filteredConcepts.length > 0 && (
            <>
              <button 
                className="btn btn-xs btn-outline btn-success gap-0.5"
                onClick={handleMarkAllKnown}
                disabled={filteredKnown === filteredConcepts.length}
                title="Mark all filtered as known"
              >
                <CheckSquare className="w-3 h-3" />
                Know ({filteredConcepts.length - filteredKnown})
              </button>
              <button 
                className="btn btn-xs btn-outline btn-warning gap-0.5"
                onClick={handleMarkAllUnknown}
                disabled={filteredKnown === 0}
                title="Mark all filtered as unknown"
              >
                <Square className="w-3 h-3" />
                Unknow ({filteredKnown})
              </button>
            </>
          )}
          
          {/* Showing count */}
          <span className="text-xs text-base-content/50 ml-auto">
            {filteredConcepts.length} words
          </span>
        </div>

        {/* Chapter Quick Toggle Strip */}
        {chapters.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-2">
            <span className="text-[10px] uppercase tracking-wider text-base-content/30 font-semibold mr-0.5 shrink-0">Ch</span>
            {chapters.map(ch => {
              const stat = chapterStats.get(ch);
              const total = stat?.total ?? 0;
              const known = stat?.known ?? 0;
              const allKnown = total > 0 && known === total;
              const partial = known > 0 && known < total;
              const pct = total > 0 ? Math.round((known / total) * 100) : 0;

              return (
                <button
                  key={ch}
                  className={`inline-flex flex-col items-center justify-center min-w-[2rem] h-8 px-1 rounded-md text-xs font-semibold transition-all ${
                    allKnown
                      ? 'bg-success text-success-content shadow-sm'
                      : partial
                        ? 'ring-1 ring-warning/50 bg-warning/10 text-base-content'
                        : 'bg-base-200/80 text-base-content/35 hover:bg-base-300'
                  }`}
                  onClick={() => handleToggleChapter(ch)}
                  title={`Ch ${ch}: ${known}/${total} known – click to ${allKnown ? 'unmark' : 'mark'} all`}
                >
                  <span className="leading-none">{ch}</span>
                  {partial && (
                    <span className="text-[8px] font-normal leading-none text-base-content/40 mt-0.5">{pct}%</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>
      
      {/* Table */}
      <div className="flex-1 overflow-hidden px-2">
        {filteredConcepts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg opacity-70">No vocabulary found</p>
            {store.concepts.length === 0 && (
              <p className="text-sm opacity-50 mt-2">
                Click "Import HSK1" to get started
              </p>
            )}
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="table table-sm table-zebra w-full">
              <thead className="text-xs sticky top-0 z-10">
                <tr className="bg-base-200">
                  <th 
                    className="cursor-pointer hover:bg-base-300 whitespace-nowrap"
                    onClick={() => handleSort('pinyin')}
                  >
                    <div className="flex items-center gap-1">
                      Pinyin <SortIcon field="pinyin" />
                    </div>
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-base-300 whitespace-nowrap"
                    onClick={() => handleSort('word')}
                  >
                    <div className="flex items-center gap-1">
                      字 <SortIcon field="word" />
                    </div>
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-base-300"
                    onClick={() => handleSort('meaning')}
                  >
                    <div className="flex items-center gap-1">
                      Meaning <SortIcon field="meaning" />
                    </div>
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-base-300 whitespace-nowrap hidden sm:table-cell"
                    onClick={() => handleSort('part_of_speech')}
                  >
                    <div className="flex items-center gap-1">
                      Type <SortIcon field="part_of_speech" />
                    </div>
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-base-300 text-center whitespace-nowrap hidden sm:table-cell"
                    onClick={() => handleSort('chapter')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Ch <SortIcon field="chapter" />
                    </div>
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-base-300 text-center whitespace-nowrap"
                    onClick={() => handleSort('knowledge')}
                    title="Knowledge level from quiz performance"
                  >
                    <div className="flex items-center justify-center gap-1">
                      % <SortIcon field="knowledge" />
                    </div>
                  </th>
                  <th 
                    className="text-center whitespace-nowrap"
                    title="Check to include in Quiz/Study"
                  >
                    ✓
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredConcepts.map(concept => (
                  <tr 
                    key={concept.id} 
                    className="hover cursor-pointer"
                    onClick={() => setSelectedConcept(concept)}
                  >
                    <td className="pinyin text-sm whitespace-nowrap">{concept.pinyin}</td>
                    <td className="whitespace-nowrap">
                      <span className="hanzi hanzi-table font-bold">
                        {concept.word}
                      </span>
                    </td>
                    <td className="text-sm max-w-[200px] truncate" title={concept.meaning}>
                      {concept.meaning}
                    </td>
                    <td className="text-xs opacity-70 hidden sm:table-cell">{formatPOS(concept.part_of_speech)}</td>
                    <td className="text-center text-sm hidden sm:table-cell">
                      <span className={concept.chapter < 0 ? 'text-secondary' : ''} title={concept.chapter < 0 ? 'Compound phrase' : `HSK Chapter ${concept.chapter}`}>
                        {Math.abs(concept.chapter)}
                      </span>
                    </td>
                    <td className="text-center text-sm">
                      <span className={`font-mono ${
                        concept.knowledge >= 80 ? 'text-success' :
                        concept.knowledge >= 50 ? 'text-warning' :
                        'text-error/70'
                      }`}>
                        {concept.knowledge}
                      </span>
                    </td>
                    <td className="text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-success checkbox-sm"
                        checked={!concept.paused}
                        onChange={() => store.togglePaused(concept.id)}
                        title={concept.paused ? 'Click to mark as known' : 'Click to mark as unknown'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Detail Card Modal */}
      {selectedConcept && (
        <VocabCard
          concept={selectedConcept}
          onTogglePaused={() => {
            store.togglePaused(selectedConcept.id);
            const updated = store.concepts.find(c => c.id === selectedConcept.id);
            if (updated) setSelectedConcept(updated);
          }}
          onClose={() => setSelectedConcept(null)}
          audioSettings={settingsStore?.settings.audio}
        />
      )}
    </div>
  );
}

// Format part of speech for display
function formatPOS(pos: string): string {
  const map: Record<string, string> = {
    noun: 'n.',
    verb: 'v.',
    adjective: 'adj.',
    adverb: 'adv.',
    pronoun: 'pron.',
    preposition: 'prep.',
    conjunction: 'conj.',
    particle: 'part.',
    numeral: 'num.',
    measure_word: 'mw.',
    interjection: 'int.',
    other: '-',
  };
  return map[pos] || pos;
}
