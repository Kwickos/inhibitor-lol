import { Redis } from '@upstash/redis';

// Check if Redis is configured
const isRedisConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL && 
  process.env.UPSTASH_REDIS_REST_TOKEN
);

// Initialize Redis client (will use UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)
const redisClient = isRedisConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Graceful Redis wrapper that won't crash if Redis is unavailable
export const redis = {
  async get<T>(key: string): Promise<T | null> {
    if (!redisClient) return null;
    try {
      return await redisClient.get<T>(key);
    } catch (error) {
      console.warn('[Redis] GET error:', error);
      return null;
    }
  },

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    if (!redisClient) return;
    try {
      if (options?.ex) {
        await redisClient.set(key, value, { ex: options.ex });
      } else {
        await redisClient.set(key, value);
      }
    } catch (error) {
      console.warn('[Redis] SET error:', error);
    }
  },

  async del(key: string): Promise<void> {
    if (!redisClient) return;
    try {
      await redisClient.del(key);
    } catch (error) {
      console.warn('[Redis] DEL error:', error);
    }
  },

  async ping(): Promise<string> {
    if (!redisClient) throw new Error('Redis not configured');
    return await redisClient.ping();
  },

  isConfigured(): boolean {
    return isRedisConfigured;
  },
};

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
