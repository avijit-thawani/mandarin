import { useState, useCallback, useMemo } from 'react';

export interface TodayFilter {
  pos: string;
  chapter: string;
}

const DEFAULT_FILTER: TodayFilter = {
  pos: 'all',
  chapter: 'all',
};

export interface TodayFilterStore {
  filter: TodayFilter;
  active: boolean;
  setFilter: (filter: TodayFilter) => void;
  clear: () => void;
  label: string;
}

export function useTodayFilterStore(): TodayFilterStore {
  const [filter, setFilterState] = useState<TodayFilter>(DEFAULT_FILTER);

  const active = filter.pos !== 'all' || filter.chapter !== 'all';

  const label = useMemo(() => {
    const parts: string[] = [];
    if (filter.pos !== 'all') {
      const display = filter.pos === 'measure_word' ? 'Measure words' :
        filter.pos.charAt(0).toUpperCase() + filter.pos.slice(1) + 's';
      parts.push(display);
    }
    if (filter.chapter !== 'all') {
      parts.push(`Ch ${filter.chapter}`);
    }
    return parts.length > 0 ? parts.join(' · ') : '';
  }, [filter]);

  const setFilter = useCallback((f: TodayFilter) => {
    setFilterState(f);
  }, []);

  const clear = useCallback(() => {
    setFilterState(DEFAULT_FILTER);
  }, []);

  return { filter, active, setFilter, clear, label };
}
