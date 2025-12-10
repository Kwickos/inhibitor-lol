import { z } from 'zod';
import { REGIONS } from '@/lib/constants/regions';

// ============================================
// Base Schemas
// ============================================

// Region validation - must be a valid region key
const regionKeys = Object.keys(REGIONS) as [string, ...string[]];
export const regionSchema = z.enum(regionKeys, {
  message: 'Invalid region',
});

// PUUID - Riot's unique identifier (78 chars, alphanumeric + hyphens)
export const puuidSchema = z
  .string()
  .min(50, 'Invalid PUUID')
  .max(100, 'Invalid PUUID')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid PUUID format');

// Riot ID format: gameName-tagLine (e.g., "Player-EUW")
export const riotIdSchema = z
  .string()
  .min(3, 'Riot ID too short')
  .max(50, 'Riot ID too long')
  .refine(
    (val) => {
      const lastDash = val.lastIndexOf('-');
      return lastDash > 0 && lastDash < val.length - 1;
    },
    { message: 'Invalid Riot ID format (expected: name-tag)' }
  );

// Summoner ID
export const summonerIdSchema = z
  .string()
  .min(10, 'Invalid Summoner ID')
  .max(100, 'Invalid Summoner ID');

// Match ID (e.g., "EUW1_1234567890")
export const matchIdSchema = z
  .string()
  .min(5, 'Invalid Match ID')
  .max(50, 'Invalid Match ID')
  .regex(/^[A-Z]+\d?_\d+$/, 'Invalid Match ID format');

// Queue filter
export const queueFilterSchema = z.enum(['solo', 'flex', 'all']).default('solo');

// Pagination
export const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20);

export const offsetSchema = z.coerce
  .number()
  .int()
  .min(0)
  .default(0);

// ============================================
// Route Parameter Schemas
// ============================================

// /api/summoner/[region]/[riotId]
export const summonerParamsSchema = z.object({
  region: regionSchema,
  riotId: riotIdSchema,
});

// /api/matches/[puuid]
export const matchesParamsSchema = z.object({
  puuid: puuidSchema,
});

export const matchesQuerySchema = z.object({
  region: regionSchema,
});

// /api/refresh-matches/[puuid]
export const refreshMatchesParamsSchema = z.object({
  puuid: puuidSchema,
});

export const refreshMatchesQuerySchema = z.object({
  region: regionSchema,
});

// /api/analysis/[puuid]
export const analysisParamsSchema = z.object({
  puuid: puuidSchema,
});

export const analysisQuerySchema = z.object({
  region: regionSchema,
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
  queue: queueFilterSchema,
});

// /api/live-game/[region]/[summonerId]
export const liveGameParamsSchema = z.object({
  region: regionSchema,
  summonerId: summonerIdSchema,
});

// /api/timeline/[matchId]
export const timelineParamsSchema = z.object({
  matchId: matchIdSchema,
});

export const timelineQuerySchema = z.object({
  region: regionSchema,
});

// /api/champion-stats/[puuid]
export const championStatsParamsSchema = z.object({
  puuid: puuidSchema,
});

// /api/duo-partners/[puuid]
export const duoPartnersParamsSchema = z.object({
  puuid: puuidSchema,
});

export const duoPartnersQuerySchema = z.object({
  region: regionSchema,
});

// /api/players/search
export const playerSearchQuerySchema = z.object({
  q: z.string().min(2, 'Search query too short').max(50, 'Search query too long'),
  region: regionSchema.optional(),
});

// /api/champion-benchmarks
export const championBenchmarksQuerySchema = z.object({
  championIds: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      return val.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
    }),
});

// ============================================
// Type exports
// ============================================

export type Region = z.infer<typeof regionSchema>;
export type SummonerParams = z.infer<typeof summonerParamsSchema>;
export type MatchesParams = z.infer<typeof matchesParamsSchema>;
export type MatchesQuery = z.infer<typeof matchesQuerySchema>;
export type AnalysisParams = z.infer<typeof analysisParamsSchema>;
export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;
export type LiveGameParams = z.infer<typeof liveGameParamsSchema>;
export type TimelineParams = z.infer<typeof timelineParamsSchema>;
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type PlayerSearchQuery = z.infer<typeof playerSearchQuerySchema>;
