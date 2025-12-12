import { redis, CACHE_TTL, cacheKeys } from './redis';
import { db } from './db';
import { summoners, matches, ranks, playerMatches, championPositionRates } from '@/db/schema';
import { eq, and, desc, sql, inArray, or, isNull } from 'drizzle-orm';
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
import { calculateGameScoreFull } from './game-score';

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
  queue?: number,
  start: number = 0
): Promise<string[]> {
  // Include count and start in cache key to avoid returning wrong matches
  const queueSuffix = queue ? `:q${queue}` : '';
  const countSuffix = `:c${count}`;
  const startSuffix = start > 0 ? `:s${start}` : '';
  const cacheKey = cacheKeys.matchIds(puuid) + queueSuffix + countSuffix + startSuffix;

  return getCachedOrFetch(cacheKey, CACHE_TTL.MATCH_IDS, async () => {
    return riotApi.getMatchIds(puuid, region, { count, queue, start });
  });
}

// Match with DB storage only (no Redis cache - matches are permanent data)
// Stores FULL API response including challenges, pings, missions for deep analytics
export async function getMatch(matchId: string, region: RegionKey): Promise<Match> {
  // Try DB first (matches are permanent, no need for Redis cache)
  try {
    const dbResult = await db.query.matches.findFirst({
      where: eq(matches.matchId, matchId),
    });

    if (dbResult) {
      // Parse JSON strings from DB
      const participants = typeof dbResult.participants === 'string'
        ? JSON.parse(dbResult.participants)
        : dbResult.participants;
      const teams = typeof dbResult.teams === 'string'
        ? JSON.parse(dbResult.teams)
        : dbResult.teams;

      // Reconstruct Match from DB with all available metadata
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
          gameType: dbResult.gameType || '',
          gameVersion: dbResult.gameVersion || '',
          mapId: dbResult.mapId || 11,
          participants: participants as Match['info']['participants'],
          platformId: dbResult.platformId || '',
          queueId: dbResult.queueId,
          teams: (teams as Match['info']['teams']) || [],
          tournamentCode: undefined,
          endOfGameResult: dbResult.endOfGameResult || undefined,
        },
      };

      return match;
    }
  } catch (e) {
    console.warn('DB error reading match:', e);
  }

  // Fetch from Riot API
  const match = await riotApi.getMatch(matchId, region);

  // Store in DB with ALL metadata (no Redis - saves cache space)
  // This includes full participant data with challenges, pings, missions
  try {
    await db
      .insert(matches)
      .values({
        matchId: match.metadata.matchId,
        gameCreation: match.info.gameCreation,
        gameDuration: match.info.gameDuration,
        gameMode: match.info.gameMode,
        queueId: match.info.queueId,
        // Additional metadata for filtering/analytics
        gameVersion: match.info.gameVersion,
        mapId: match.info.mapId,
        platformId: match.info.platformId,
        gameType: match.info.gameType,
        endOfGameResult: match.info.endOfGameResult,
        // Full participant data (includes challenges, pings, missions)
        participants: match.info.participants,
        teams: match.info.teams,
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

  if (liveGame) {
    // Cache if player is in game
    redis.set(cacheKey, liveGame, { ex: CACHE_TTL.LIVE_GAME }).catch(console.warn);
  } else {
    // Game ended - delete any stale cache to ensure accurate detection
    redis.del(cacheKey).catch(console.warn);
  }

  return liveGame;
}

// Store player match data for ALL participants with extended stats for analytics
// This stores denormalized data for fast queries without parsing JSON
export async function storePlayerMatch(
  puuid: string,
  match: Match
): Promise<void> {
  try {
    const gameCreation = new Date(match.info.gameCreation);
    const allParticipants = match.info.participants;
    const teams = match.info.teams;

    // Store data for ALL 10 participants, not just the requested player
    // This way, when we visit another player's profile, we already have their match data
    const values = allParticipants.map(participant => {
      // Extract challenges data (may not exist for all game modes)
      const challenges = participant.challenges;

      // Get primary and secondary rune styles
      const primaryStyle = participant.perks?.styles?.find(s => s.description === 'primaryStyle');
      const secondaryStyle = participant.perks?.styles?.find(s => s.description === 'subStyle');

      // Calculate full game score for this participant
      const teamObjectives = teams?.find(t => t.teamId === participant.teamId);
      let gameScore: number | null = null;
      let gameGrade: string | null = null;
      let combatScore: number | null = null;
      let farmingScore: number | null = null;
      let visionScore2: number | null = null;
      let objectivesScore: number | null = null;
      let insights: string[] | null = null;
      let improvements: string[] | null = null;

      try {
        const score = calculateGameScoreFull(
          participant,
          allParticipants,
          match.info.gameDuration,
          participant.win,
          teamObjectives
        );
        gameScore = score.overall;
        gameGrade = score.grade;
        combatScore = score.combat;
        farmingScore = score.farming;
        visionScore2 = score.vision;
        objectivesScore = score.objectives;
        insights = score.insights;
        improvements = score.improvements;
      } catch (e) {
        // Score calculation failed, leave as null
        console.warn('Failed to calculate game score:', e);
      }

      return {
        puuid: participant.puuid,
        matchId: match.metadata.matchId,
        win: participant.win,
        championId: participant.championId,
        championName: participant.championName,
        champLevel: participant.champLevel,
        teamId: participant.teamId,
        gameEndedInEarlySurrender: participant.gameEndedInEarlySurrender ?? false,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
        visionScore: participant.visionScore,
        teamPosition: participant.teamPosition,
        // Extended stats for analytics
        goldEarned: participant.goldEarned,
        totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
        totalDamageTaken: participant.totalDamageTaken,
        totalHeal: participant.totalHeal,
        totalDamageShieldedOnTeammates: participant.totalDamageShieldedOnTeammates,
        wardsPlaced: participant.wardsPlaced,
        wardsKilled: participant.wardsKilled,
        controlWardsPlaced: participant.detectorWardsPlaced ?? participant.visionWardsBoughtInGame,
        doubleKills: participant.doubleKills,
        tripleKills: participant.tripleKills,
        quadraKills: participant.quadraKills,
        pentaKills: participant.pentaKills,
        firstBloodKill: participant.firstBloodKill,
        turretKills: participant.turretKills,
        objectivesStolen: participant.objectivesStolen,
        // Challenges stats (stored as integers, multiply floats by 100)
        damagePerMinute: challenges?.damagePerMinute ? Math.round(challenges.damagePerMinute) : null,
        goldPerMinute: challenges?.goldPerMinute ? Math.round(challenges.goldPerMinute) : null,
        kda: challenges?.kda ? Math.round(challenges.kda * 100) : null,
        killParticipation: challenges?.killParticipation ? Math.round(challenges.killParticipation * 100) : null,
        teamDamagePercentage: challenges?.teamDamagePercentage ? Math.round(challenges.teamDamagePercentage * 100) : null,
        visionScorePerMinute: challenges?.visionScorePerMinute ? Math.round(challenges.visionScorePerMinute * 100) : null,
        soloKills: challenges?.soloKills ?? null,
        skillshotsDodged: challenges?.skillshotsDodged ?? null,
        skillshotsHit: challenges?.skillshotsHit ?? null,
        // Time data
        timePlayed: participant.timePlayed,
        totalTimeSpentDead: participant.totalTimeSpentDead,
        // Items (for build path analysis)
        item0: participant.item0,
        item1: participant.item1,
        item2: participant.item2,
        item3: participant.item3,
        item4: participant.item4,
        item5: participant.item5,
        item6: participant.item6,
        // Summoner spells
        summoner1Id: participant.summoner1Id,
        summoner2Id: participant.summoner2Id,
        // Runes
        primaryRune: primaryStyle?.selections?.[0]?.perk ?? null,
        secondaryRune: secondaryStyle?.style ?? null,
        // Game metadata (denormalized)
        queueId: match.info.queueId,
        gameVersion: match.info.gameVersion,
        // Pre-calculated game score (full)
        gameScore,
        gameGrade,
        combatScore,
        farmingScore,
        visionScore2,
        objectivesScore,
        insights,
        improvements,
        createdAt: gameCreation,
      };
    });

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

// Get all match summaries from DB for a player (no API calls)
export async function getStoredMatchSummaries(puuid: string): Promise<{
  matchId: string;
  queueId: number;
  gameCreation: number;
  gameDuration: number;
  gameMode: string;
  win: boolean;
  isRemake: boolean;
  participant: Match['info']['participants'][0];
  allParticipants?: Match['info']['participants'];
  teams?: Match['info']['teams'];
  gameScore?: number;
  gameGrade?: string;
  combatScore?: number;
  farmingScore?: number;
  visionScore2?: number;
  objectivesScore?: number;
  insights?: string[];
  improvements?: string[];
}[]> {
  try {
    // FAST PATH: Query playerMatches + matches metadata (no JSON parsing needed)
    const results = await db
      .select({
        // Match metadata
        matchId: matches.matchId,
        queueId: matches.queueId,
        gameCreation: matches.gameCreation,
        gameDuration: matches.gameDuration,
        gameMode: matches.gameMode,
        // PlayerMatch data (denormalized participant stats)
        win: playerMatches.win,
        championId: playerMatches.championId,
        championName: playerMatches.championName,
        champLevel: playerMatches.champLevel,
        teamId: playerMatches.teamId,
        gameEndedInEarlySurrender: playerMatches.gameEndedInEarlySurrender,
        kills: playerMatches.kills,
        deaths: playerMatches.deaths,
        assists: playerMatches.assists,
        cs: playerMatches.cs,
        visionScore: playerMatches.visionScore,
        teamPosition: playerMatches.teamPosition,
        goldEarned: playerMatches.goldEarned,
        totalDamageDealtToChampions: playerMatches.totalDamageDealtToChampions,
        totalDamageTaken: playerMatches.totalDamageTaken,
        wardsPlaced: playerMatches.wardsPlaced,
        wardsKilled: playerMatches.wardsKilled,
        controlWardsPlaced: playerMatches.controlWardsPlaced,
        doubleKills: playerMatches.doubleKills,
        tripleKills: playerMatches.tripleKills,
        quadraKills: playerMatches.quadraKills,
        pentaKills: playerMatches.pentaKills,
        firstBloodKill: playerMatches.firstBloodKill,
        item0: playerMatches.item0,
        item1: playerMatches.item1,
        item2: playerMatches.item2,
        item3: playerMatches.item3,
        item4: playerMatches.item4,
        item5: playerMatches.item5,
        item6: playerMatches.item6,
        summoner1Id: playerMatches.summoner1Id,
        summoner2Id: playerMatches.summoner2Id,
        primaryRune: playerMatches.primaryRune,
        secondaryRune: playerMatches.secondaryRune,
        soloKills: playerMatches.soloKills,
        turretKills: playerMatches.turretKills,
        timePlayed: playerMatches.timePlayed,
        killParticipation: playerMatches.killParticipation,
        // Pre-calculated game score
        gameScore: playerMatches.gameScore,
        gameGrade: playerMatches.gameGrade,
        combatScore: playerMatches.combatScore,
        farmingScore: playerMatches.farmingScore,
        visionScore2: playerMatches.visionScore2,
        objectivesScore: playerMatches.objectivesScore,
        insights: playerMatches.insights,
        improvements: playerMatches.improvements,
      })
      .from(playerMatches)
      .innerJoin(matches, eq(playerMatches.matchId, matches.matchId))
      .where(eq(playerMatches.puuid, puuid))
      .orderBy(desc(matches.gameCreation));

    // Build summaries with reconstructed participant object
    const summaries = [];
    for (const row of results) {
      // Reconstruct participant from playerMatches data
      const participant = {
        puuid,
        championId: row.championId,
        championName: row.championName,
        champLevel: row.champLevel ?? 1,
        teamId: row.teamId || 100, // Default to blue team for old data
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        totalMinionsKilled: row.cs,
        neutralMinionsKilled: 0,
        visionScore: row.visionScore,
        teamPosition: row.teamPosition || '',
        individualPosition: row.teamPosition || '',
        goldEarned: row.goldEarned || 0,
        totalDamageDealtToChampions: row.totalDamageDealtToChampions || 0,
        totalDamageTaken: row.totalDamageTaken || 0,
        wardsPlaced: row.wardsPlaced || 0,
        wardsKilled: row.wardsKilled || 0,
        visionWardsBoughtInGame: row.controlWardsPlaced || 0,
        doubleKills: row.doubleKills || 0,
        tripleKills: row.tripleKills || 0,
        quadraKills: row.quadraKills || 0,
        pentaKills: row.pentaKills || 0,
        firstBloodKill: row.firstBloodKill || false,
        firstBloodAssist: false,
        item0: row.item0 || 0,
        item1: row.item1 || 0,
        item2: row.item2 || 0,
        item3: row.item3 || 0,
        item4: row.item4 || 0,
        item5: row.item5 || 0,
        item6: row.item6 || 0,
        summoner1Id: row.summoner1Id || 0,
        summoner2Id: row.summoner2Id || 0,
        perks: {
          styles: [
            { style: 0, selections: [{ perk: row.primaryRune || 0 }] },
            { style: row.secondaryRune || 0, selections: [] },
          ],
        },
        win: row.win,
        gameEndedInEarlySurrender: row.gameEndedInEarlySurrender ?? false,
        challenges: {
          soloKills: row.soloKills || 0,
          killParticipation: row.killParticipation ? row.killParticipation / 100 : undefined, // Stored as 0-100, API uses 0-1
        },
        turretKills: row.turretKills || 0,
        timePlayed: row.timePlayed || row.gameDuration,
      } as Match['info']['participants'][0];

      // Detect remake: early surrender OR game < 5 minutes (300 seconds)
      const isRemake = row.gameEndedInEarlySurrender === true || row.gameDuration < 300;

      summaries.push({
        matchId: row.matchId,
        queueId: row.queueId,
        gameCreation: row.gameCreation,
        gameDuration: row.gameDuration,
        gameMode: row.gameMode,
        win: row.win,
        isRemake,
        participant,
        // allParticipants and teams are NOT loaded here - loaded on demand
        allParticipants: undefined,
        teams: undefined,
        // Pre-calculated game score from DB
        gameScore: row.gameScore ?? undefined,
        gameGrade: row.gameGrade ?? undefined,
        combatScore: row.combatScore ?? undefined,
        farmingScore: row.farmingScore ?? undefined,
        visionScore2: row.visionScore2 ?? undefined,
        objectivesScore: row.objectivesScore ?? undefined,
        insights: row.insights ?? undefined,
        improvements: row.improvements ?? undefined,
      });
    }

    return summaries;
  } catch (e) {
    console.warn('DB error reading match summaries:', e);
    return [];
  }
}

// Get full match details (with all participants) for a single match
export async function getMatchDetails(matchId: string, puuid: string): Promise<{
  allParticipants: Match['info']['participants'];
  teams: Match['info']['teams'];
} | null> {
  try {
    const result = await db
      .select({
        participants: matches.participants,
        teams: matches.teams,
      })
      .from(matches)
      .where(eq(matches.matchId, matchId))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    const participants = typeof row.participants === 'string'
      ? JSON.parse(row.participants)
      : row.participants;
    const teams = typeof row.teams === 'string'
      ? JSON.parse(row.teams)
      : (row.teams || []);

    return { allParticipants: participants, teams };
  } catch (e) {
    console.warn('DB error reading match details:', e);
    return null;
  }
}

// Get champion stats from stored data (ranked games only, with fallback for old data)
export async function getChampionStats(puuid: string) {
  try {
    // Filter for ranked games (Solo/Duo 420, Flex 440)
    // Also include records with null queueId for backward compatibility with old data
    const playerMatchData = await db.query.playerMatches.findMany({
      where: and(
        eq(playerMatches.puuid, puuid),
        or(
          inArray(playerMatches.queueId, QUEUE_IDS.ALL_RANKED),
          isNull(playerMatches.queueId)
        )
      ),
      orderBy: desc(playerMatches.createdAt),
      limit: 100, // Last 100 ranked games
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

// Aggregate champion position rates from playerMatches (ranked games only)
export async function aggregateChampionPositionRates(): Promise<void> {
  try {
    // Get all position counts grouped by champion (ranked games only for accurate data)
    // Include null queueId for backward compatibility with old data
    const results = await db
      .select({
        championId: playerMatches.championId,
        position: playerMatches.teamPosition,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(playerMatches)
      .where(and(
        sql`${playerMatches.teamPosition} IS NOT NULL AND ${playerMatches.teamPosition} != ''`,
        or(
          inArray(playerMatches.queueId, QUEUE_IDS.ALL_RANKED),
          isNull(playerMatches.queueId)
        )
      ))
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
