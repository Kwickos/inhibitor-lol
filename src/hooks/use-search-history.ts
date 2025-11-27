'use client';

import { useState, useEffect, useCallback } from 'react';

export interface SearchHistoryItem {
  gameName: string;
  tagLine: string;
  region: string;
  searchedAt: number;
}

const STORAGE_KEY = 'inhibitor_search_history';
const MAX_HISTORY = 20;

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Failed to load search history:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save history to localStorage
  const saveHistory = useCallback((newHistory: SearchHistoryItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      setHistory(newHistory);
    } catch (error) {
      console.warn('Failed to save search history:', error);
    }
  }, []);

  // Add to history
  const addToHistory = useCallback(
    (item: Omit<SearchHistoryItem, 'searchedAt'>) => {
      const newItem: SearchHistoryItem = {
        ...item,
        searchedAt: Date.now(),
      };

      setHistory((prev) => {
        // Remove duplicate if exists
        const filtered = prev.filter(
          (h) =>
            !(
              h.gameName.toLowerCase() === item.gameName.toLowerCase() &&
              h.tagLine.toLowerCase() === item.tagLine.toLowerCase() &&
              h.region === item.region
            )
        );

        // Add to beginning, limit to max
        const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY);
        saveHistory(newHistory);
        return newHistory;
      });
    },
    [saveHistory]
  );

  // Clear history
  const clearHistory = useCallback(() => {
    saveHistory([]);
  }, [saveHistory]);

  // Remove single item
  const removeFromHistory = useCallback(
    (index: number) => {
      setHistory((prev) => {
        const newHistory = prev.filter((_, i) => i !== index);
        saveHistory(newHistory);
        return newHistory;
      });
    },
    [saveHistory]
  );

  return {
    history,
    isLoaded,
    addToHistory,
    clearHistory,
    removeFromHistory,
  };
}
