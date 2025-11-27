import { Redis } from '@upstash/redis';

// Initialize Redis client (will use UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Cache TTLs in seconds
export const CACHE_TTL = {
  SUMMONER: 60 * 60, // 1 hour
  MATCH_IDS: 5 * 60, // 5 minutes
  MATCH_DETAILS: 24 * 60 * 60, // 24 hours
  RANKS: 10 * 60, // 10 minutes
  MASTERIES: 60 * 60, // 1 hour
  LIVE_GAME: 30, // 30 seconds
} as const;

// Cache key generators
export const cacheKeys = {
  summoner: (puuid: string) => `summoner:${puuid}`,
  matchIds: (puuid: string) => `match_ids:${puuid}`,
  match: (matchId: string) => `match:${matchId}`,
  ranks: (puuid: string) => `ranks:${puuid}`,
  masteries: (puuid: string) => `masteries:${puuid}`,
  liveGame: (puuid: string) => `live_game:${puuid}`,
  account: (gameName: string, tagLine: string, region: string) =>
    `account:${region}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`,
};
