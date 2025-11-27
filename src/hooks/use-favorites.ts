'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Favorite {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  addedAt: number;
}

const STORAGE_KEY = 'inhibitor_favorites';
const MAX_FAVORITES = 10;

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load favorites from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Failed to load favorites:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save favorites to localStorage
  const saveFavorites = useCallback((newFavorites: Favorite[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (error) {
      console.warn('Failed to save favorites:', error);
    }
  }, []);

  // Add a favorite
  const addFavorite = useCallback(
    (favorite: Omit<Favorite, 'addedAt'>) => {
      const newFavorite: Favorite = {
        ...favorite,
        addedAt: Date.now(),
      };

      setFavorites((prev) => {
        // Check if already exists
        const exists = prev.some(
          (f) =>
            f.gameName.toLowerCase() === favorite.gameName.toLowerCase() &&
            f.tagLine.toLowerCase() === favorite.tagLine.toLowerCase() &&
            f.region === favorite.region
        );

        if (exists) return prev;

        // Add to beginning, limit to max
        const newFavorites = [newFavorite, ...prev].slice(0, MAX_FAVORITES);
        saveFavorites(newFavorites);
        return newFavorites;
      });
    },
    [saveFavorites]
  );

  // Remove a favorite
  const removeFavorite = useCallback(
    (puuid: string) => {
      setFavorites((prev) => {
        const newFavorites = prev.filter((f) => f.puuid !== puuid);
        saveFavorites(newFavorites);
        return newFavorites;
      });
    },
    [saveFavorites]
  );

  // Check if is favorite
  const isFavorite = useCallback(
    (puuid: string) => {
      return favorites.some((f) => f.puuid === puuid);
    },
    [favorites]
  );

  // Toggle favorite
  const toggleFavorite = useCallback(
    (favorite: Omit<Favorite, 'addedAt'>) => {
      if (isFavorite(favorite.puuid)) {
        removeFavorite(favorite.puuid);
      } else {
        addFavorite(favorite);
      }
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  return {
    favorites,
    isLoaded,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
  };
}
