import { Redis } from '@upstash/redis';

// Initialize Redis client (will use UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Cache TTLs in seconds
// Note: Matches are stored in Turso DB permanently, Redis is only for volatile data
export const CACHE_TTL = {
  SUMMONER: 15 * 60, // 15 minutes
  MATCH_IDS: 2 * 60, // 2 minutes (just to avoid hammering API during page load)
  RANKS: 5 * 60, // 5 minutes
  MASTERIES: 15 * 60, // 15 minutes
  LIVE_GAME: 30, // 30 seconds
  ANALYSIS: 5 * 60, // 5 minutes
} as const;

// Cache key generators
// Note: matches are stored in DB only (no Redis) to save cache space
export const cacheKeys = {
  summoner: (puuid: string) => `summoner:${puuid}`,
  matchIds: (puuid: string) => `match_ids:${puuid}`,
  ranks: (puuid: string) => `ranks:${puuid}`,
  masteries: (puuid: string) => `masteries:${puuid}`,
  liveGame: (puuid: string) => `live_game:${puuid}`,
  account: (gameName: string, tagLine: string, region: string) =>
    `account:${region}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`,
  analysis: (puuid: string, queue: string) => `analysis:${puuid}:${queue}`,
};
