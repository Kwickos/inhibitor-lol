import { Redis } from '@upstash/redis';

// Initialize Redis client (will use UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Cache TTLs in seconds
// Note: Matches are also stored in Turso DB, so Redis is just a short-term cache
export const CACHE_TTL = {
  SUMMONER: 30 * 60, // 30 minutes (DB has permanent storage)
  MATCH_IDS: 5 * 60, // 5 minutes
  MATCH_DETAILS: 30 * 60, // 30 minutes (DB has permanent storage)
  RANKS: 10 * 60, // 10 minutes
  MASTERIES: 30 * 60, // 30 minutes
  LIVE_GAME: 30, // 30 seconds
  ANALYSIS: 10 * 60, // 10 minutes
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
  analysis: (puuid: string, queue: string) => `analysis:${puuid}:${queue}`,
};
