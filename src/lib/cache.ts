import { redis, CACHE_TTL, cacheKeys } from './redis';
import { db } from './db';
import { summoners, matches, ranks, playerMatches, championPositionRates } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { RegionKey } from './constants/regions';
import type {
  RiotAccount,
  Summoner,
  LeagueEntry,
  Match,
  ChampionMastery,
  CurrentGameInfo,
} from '@/types/riot';
import * as riotApi from './riot-api';

// Generic cache function
async function getCachedOrFetch<T>(
  cacheKey: string,
  ttl: number,
  fetcher: () => Promise<T>,
  forceRefresh = false
): Promise<T> {
  if (!forceRefresh) {
    try {
      // Try Redis first
      const cached = await redis.get<T>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('Redis error:', error);
      // Continue without cache
    }
  }

  // Fetch from source
  const data = await fetcher();

  // Store in Redis (don't await, fire and forget)
  redis.set(cacheKey, data, { ex: ttl }).catch(console.warn);

  return data;
}

// Account with caching
export async function getAccount(
  gameName: string,
  tagLine: string,
  region: RegionKey,
  forceRefresh = false
): Promise<RiotAccount> {
  const cacheKey = cacheKeys.account(gameName, tagLine, region);

  return getCachedOrFetch(cacheKey, CACHE_TTL.SUMMONER, async () => {
    return riotApi.getAccountByRiotId(gameName, tagLine, region);
  }, forceRefresh);
}

// Summoner with caching (Redis + DB)
export async function getSummoner(puuid: string, region: RegionKey): Promise<Summoner> {
  const cacheKey = cacheKeys.summoner(puuid);

  // Try Redis
  try {
    const cached = await redis.get<Summoner>(cacheKey);
    if (cached) return cached;
  } catch (e) {
    console.warn('Redis error:', e);
  }

  // Try DB (with graceful fallback if tables don't exist)
  try {
    const dbResult = await db.query.summoners.findFirst({
      where: eq(summoners.puuid, puuid),
    });

    if (dbResult) {
      const now = new Date();
      const updatedAt = new Date(dbResult.updatedAt);
      const ageInSeconds = (now.getTime() - updatedAt.getTime()) / 1000;

      // If data is fresh enough, use it
      if (ageInSeconds < CACHE_TTL.SUMMONER) {
        // Create Summoner object from DB data
        const summoner: Summoner = {
          id: dbResult.summonerId,
          accountId: '',
          puuid: dbResult.puuid,
          profileIconId: dbResult.profileIconId,
          revisionDate: dbResult.updatedAt.getTime(),
          summonerLevel: dbResult.summonerLevel,
        };

        // Store in Redis
        redis.set(cacheKey, summoner, { ex: CACHE_TTL.SUMMONER }).catch(console.warn);
        return summoner;
      }
    }
  } catch (e) {
    console.warn('DB error (tables may not exist yet):', e);
  }

  // Fetch from Riot API
  const summoner = await riotApi.getSummonerByPuuid(puuid, region);

  // Store in Redis
  redis.set(cacheKey, summoner, { ex: CACHE_TTL.SUMMONER }).catch(console.warn);

  return summoner;
}

// Ranks with caching (using PUUID endpoint like LeagueStats)
export async function getRanks(puuid: string, region: RegionKey): Promise<LeagueEntry[]> {
  const cacheKey = cacheKeys.ranks(puuid);

  return getCachedOrFetch(cacheKey, CACHE_TTL.RANKS, async () => {
    const entries = await riotApi.getLeagueEntriesByPuuid(puuid, region);

    // Store in DB for persistence (non-blocking, graceful fallback)
    try {
      const now = new Date();
      for (const entry of entries) {
        await db
          .insert(ranks)
          .values({
            puuid,
            queueType: entry.queueType,
            tier: entry.tier,
            rank: entry.rank,
            leaguePoints: entry.leaguePoints,
            wins: entry.wins,
            losses: entry.losses,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [ranks.puuid, ranks.queueType],
            set: {
              tier: entry.tier,
              rank: entry.rank,
              leaguePoints: entry.leaguePoints,
              wins: entry.wins,
              losses: entry.losses,
              updatedAt: now,
            },
          });
      }
    } catch (e) {
      console.warn('DB error storing ranks:', e);
    }

    return entries;
  });
}

// Queue IDs for ranked games
export const QUEUE_IDS = {
  RANKED_SOLO: 420,
  RANKED_FLEX: 440,
  ALL_RANKED: [420, 440],
} as const;

// Match IDs with caching
export async function getMatchIds(
  puuid: string,
  region: RegionKey,
  count: number = 20,
  queue?: number
): Promise<string[]> {
  // Include count in cache key to avoid returning fewer matches than requested
  const queueSuffix = queue ? `:q${queue}` : '';
  const countSuffix = `:c${count}`;
  const cacheKey = cacheKeys.matchIds(puuid) + queueSuffix + countSuffix;

  return getCachedOrFetch(cacheKey, CACHE_TTL.MATCH_IDS, async () => {
    return riotApi.getMatchIds(puuid, region, { count, queue });
  });
}

// Match with caching (Redis + DB)
export async function getMatch(matchId: string, region: RegionKey): Promise<Match> {
  const cacheKey = cacheKeys.match(matchId);

  // Try Redis
  try {
    const cached = await redis.get<Match>(cacheKey);
    if (cached) return cached;
  } catch (e) {
    console.warn('Redis error:', e);
  }

  // Try DB (with graceful fallback if tables don't exist)
  try {
    const dbResult = await db.query.matches.findFirst({
      where: eq(matches.matchId, matchId),
    });

    if (dbResult) {
      // Reconstruct Match from DB
      const match: Match = {
        metadata: {
          dataVersion: '2',
          matchId: dbResult.matchId,
          participants: [],
        },
        info: {
          gameCreation: dbResult.gameCreation,
          gameDuration: dbResult.gameDuration,
          gameEndTimestamp: 0,
          gameId: 0,
          gameMode: dbResult.gameMode,
          gameName: '',
          gameStartTimestamp: dbResult.gameCreation,
          gameType: '',
          gameVersion: '',
          mapId: 11,
          participants: dbResult.participants as Match['info']['participants'],
          platformId: '',
          queueId: dbResult.queueId,
          teams: [],
          tournamentCode: undefined,
        },
      };

      // Store in Redis
      redis.set(cacheKey, match, { ex: CACHE_TTL.MATCH_DETAILS }).catch(console.warn);
      return match;
    }
  } catch (e) {
    console.warn('DB error reading match:', e);
  }

  // Fetch from Riot API
  const match = await riotApi.getMatch(matchId, region);

  // Store in Redis
  redis.set(cacheKey, match, { ex: CACHE_TTL.MATCH_DETAILS }).catch(console.warn);

  // Store in DB (non-blocking, graceful fallback)
  try {
    await db
      .insert(matches)
      .values({
        matchId: match.metadata.matchId,
        gameCreation: match.info.gameCreation,
        gameDuration: match.info.gameDuration,
        gameMode: match.info.gameMode,
        queueId: match.info.queueId,
        participants: match.info.participants,
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  } catch (e) {
    console.warn('DB error storing match:', e);
  }

  return match;
}

// Champion masteries with caching
export async function getMasteries(
  puuid: string,
  region: RegionKey,
  top: number = 5
): Promise<ChampionMastery[]> {
  const cacheKey = cacheKeys.masteries(puuid);

  return getCachedOrFetch(cacheKey, CACHE_TTL.MASTERIES, async () => {
    return riotApi.getChampionMasteries(puuid, region, top);
  });
}

// Live game with short caching
export async function getLiveGame(
  puuid: string,
  region: RegionKey
): Promise<CurrentGameInfo | null> {
  const cacheKey = cacheKeys.liveGame(puuid);

  // Short TTL, so we check cache but fetch often
  try {
    const cached = await redis.get<CurrentGameInfo | null>(cacheKey);
    if (cached !== undefined && cached !== null) {
      return cached;
    }
  } catch (e) {
    console.warn('Redis error:', e);
  }

  const liveGame = await riotApi.getCurrentGame(puuid, region);

  // Only cache if player is in game (don't cache null)
  if (liveGame) {
    redis.set(cacheKey, liveGame, { ex: CACHE_TTL.LIVE_GAME }).catch(console.warn);
  }

  return liveGame;
}

// Store player match data for ALL participants (so we don't need to refetch for other profiles)
export async function storePlayerMatch(
  puuid: string,
  match: Match
): Promise<void> {
  try {
    const gameCreation = new Date(match.info.gameCreation);

    // Store data for ALL 10 participants, not just the requested player
    // This way, when we visit another player's profile, we already have their match data
    const values = match.info.participants.map(participant => ({
      puuid: participant.puuid,
      matchId: match.metadata.matchId,
      win: participant.win,
      championId: participant.championId,
      championName: participant.championName,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
      visionScore: participant.visionScore,
      teamPosition: participant.teamPosition,
      createdAt: gameCreation,
    }));

    // Insert all participants (ignore conflicts for existing entries)
    for (const value of values) {
      await db
        .insert(playerMatches)
        .values(value)
        .onConflictDoNothing();
    }
  } catch (e) {
    console.warn('DB error storing player matches:', e);
  }
}

// Get stored match IDs for a player from DB (for historical data beyond API limit)
export async function getStoredMatchIds(
  puuid: string,
  limit: number = 100,
  queueIds?: number[]
): Promise<string[]> {
  try {
    // Get match IDs from playerMatches table, ordered by creation date
    const results = await db
      .select({
        matchId: playerMatches.matchId,
        createdAt: playerMatches.createdAt,
      })
      .from(playerMatches)
      .where(eq(playerMatches.puuid, puuid))
      .orderBy(desc(playerMatches.createdAt))
      .limit(limit * 2); // Get more to filter by queue

    if (queueIds && queueIds.length > 0) {
      // Filter by queue IDs - need to check the matches table
      const matchIdsToCheck = results.map(r => r.matchId);
      const matchesWithQueues = await db
        .select({ matchId: matches.matchId, queueId: matches.queueId })
        .from(matches)
        .where(sql`${matches.matchId} IN (${sql.join(matchIdsToCheck.map(id => sql`${id}`), sql`, `)})`);

      const queueMap = new Map(matchesWithQueues.map(m => [m.matchId, m.queueId]));

      return results
        .filter(r => {
          const queueId = queueMap.get(r.matchId);
          return queueId && queueIds.includes(queueId);
        })
        .slice(0, limit)
        .map(r => r.matchId);
    }

    return results.slice(0, limit).map(r => r.matchId);
  } catch (e) {
    console.warn('DB error reading stored match IDs:', e);
    return [];
  }
}

// Get total match count for a player from DB
export async function getStoredMatchCount(puuid: string): Promise<number> {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(playerMatches)
      .where(eq(playerMatches.puuid, puuid));
    return result[0]?.count || 0;
  } catch (e) {
    console.warn('DB error counting stored matches:', e);
    return 0;
  }
}

// Get champion stats from stored data
export async function getChampionStats(puuid: string) {
  try {
    const playerMatchData = await db.query.playerMatches.findMany({
      where: eq(playerMatches.puuid, puuid),
      orderBy: desc(playerMatches.createdAt),
      limit: 100, // Last 100 games
    });

    // Aggregate stats by champion
    const statsByChampion = new Map<number, {
      championId: number;
      championName: string;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      cs: number;
    }>();

    for (const match of playerMatchData) {
      const existing = statsByChampion.get(match.championId);
      if (existing) {
        existing.games++;
        existing.wins += match.win ? 1 : 0;
        existing.kills += match.kills;
        existing.deaths += match.deaths;
        existing.assists += match.assists;
        existing.cs += match.cs;
      } else {
        statsByChampion.set(match.championId, {
          championId: match.championId,
          championName: match.championName,
          games: 1,
          wins: match.win ? 1 : 0,
          kills: match.kills,
          deaths: match.deaths,
          assists: match.assists,
          cs: match.cs,
        });
      }
    }

    // Convert to array and calculate averages
    return Array.from(statsByChampion.values())
      .map(stats => ({
        championId: stats.championId,
        championName: stats.championName,
        games: stats.games,
        wins: stats.wins,
        losses: stats.games - stats.wins,
        avgKills: stats.kills / stats.games,
        avgDeaths: stats.deaths / stats.games,
        avgAssists: stats.assists / stats.games,
        avgCs: stats.cs / stats.games,
        winRate: (stats.wins / stats.games) * 100,
        kda: stats.deaths === 0 ? stats.kills + stats.assists : (stats.kills + stats.assists) / stats.deaths,
      }))
      .sort((a, b) => b.games - a.games);
  } catch (e) {
    console.warn('DB error reading champion stats:', e);
    return []; // Return empty array if DB not available
  }
}

// Aggregate champion position rates from playerMatches
export async function aggregateChampionPositionRates(): Promise<void> {
  try {
    // Get all position counts grouped by champion
    const results = await db
      .select({
        championId: playerMatches.championId,
        position: playerMatches.teamPosition,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(playerMatches)
      .where(sql`${playerMatches.teamPosition} IS NOT NULL AND ${playerMatches.teamPosition} != ''`)
      .groupBy(playerMatches.championId, playerMatches.teamPosition);

    const now = new Date();

    // Upsert each result
    for (const row of results) {
      if (!row.position) continue;

      // Normalize position names
      const normalizedPosition = normalizePosition(row.position);
      if (!normalizedPosition) continue;

      await db
        .insert(championPositionRates)
        .values({
          championId: row.championId,
          position: normalizedPosition,
          gamesPlayed: row.count,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [championPositionRates.championId, championPositionRates.position],
          set: {
            gamesPlayed: row.count,
            updatedAt: now,
          },
        });
    }

    console.log(`Aggregated position rates for ${results.length} champion-position combinations`);
  } catch (e) {
    console.warn('DB error aggregating champion position rates:', e);
  }
}

// Normalize Riot position names to our format
function normalizePosition(position: string): string | null {
  const mapping: Record<string, string> = {
    TOP: 'TOP',
    JUNGLE: 'JUNGLE',
    MIDDLE: 'MIDDLE',
    MID: 'MIDDLE',
    BOTTOM: 'BOTTOM',
    ADC: 'BOTTOM',
    UTILITY: 'UTILITY',
    SUPPORT: 'UTILITY',
  };
  return mapping[position.toUpperCase()] || null;
}

// Get champion position rates from our DB
export async function getLocalChampionPositionRates(
  championId: number
): Promise<Record<string, number> | null> {
  try {
    const rates = await db.query.championPositionRates.findMany({
      where: eq(championPositionRates.championId, championId),
    });

    if (rates.length === 0) return null;

    // Calculate total games for this champion
    const totalGames = rates.reduce((sum, r) => sum + r.gamesPlayed, 0);
    if (totalGames === 0) return null;

    // Convert to play rate percentages
    const result: Record<string, number> = {};
    for (const rate of rates) {
      result[rate.position] = rate.gamesPlayed / totalGames;
    }

    return result;
  } catch (e) {
    console.warn('DB error reading champion position rates:', e);
    return null;
  }
}

// Get all champion position rates from our DB (for caching)
export async function getAllLocalChampionPositionRates(): Promise<Record<number, Record<string, number>>> {
  try {
    const allRates = await db.query.championPositionRates.findMany();

    // Group by championId
    const byChampion = new Map<number, { position: string; games: number }[]>();
    for (const rate of allRates) {
      const existing = byChampion.get(rate.championId) || [];
      existing.push({ position: rate.position, games: rate.gamesPlayed });
      byChampion.set(rate.championId, existing);
    }

    // Calculate percentages
    const result: Record<number, Record<string, number>> = {};
    for (const [champId, positions] of byChampion) {
      const totalGames = positions.reduce((sum, p) => sum + p.games, 0);
      if (totalGames === 0) continue;

      result[champId] = {};
      for (const pos of positions) {
        result[champId][pos.position] = pos.games / totalGames;
      }
    }

    return result;
  } catch (e) {
    console.warn('DB error reading all champion position rates:', e);
    return {};
  }
}
