import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch, QUEUE_IDS } from '@/lib/cache';
import { redis, cacheKeys, CACHE_TTL } from '@/lib/redis';
import { db } from '@/lib/db';
import { championBenchmarks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';
import type { Match, Participant, Team } from '@/types/riot';
import {
  type PlayerAnalysis,
  type OverallStats,
  type RoleStats,
  type ChampionAnalysis,
  type ChampionHighEloComparison,
  type ComparisonMetric,
  type PerformanceTrends,
  type AnalysisInsight,
  type ImprovementSuggestion,
  type BenchmarkComparison,
  ROLE_BENCHMARKS,
  getRating,
  getPercentile,
  MIN_GAMES_FOR_ANALYSIS,
  RECOMMENDED_GAMES_FOR_ANALYSIS,
} from '@/types/analysis';

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

const GAMES_TO_ANALYZE = 50; // Analyze last 50 games for comprehensive analysis

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { puuid } = await params;
    const { searchParams } = new URL(request.url);

    const region = searchParams.get('region') as RegionKey;
    const gameName = searchParams.get('gameName') || '';
    const tagLine = searchParams.get('tagLine') || '';
    const queueParam = searchParams.get('queue') || 'solo'; // 'solo', 'flex', or 'all'

    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // Check cache first
    const analysisCacheKey = cacheKeys.analysis(puuid, queueParam);
    try {
      const cachedAnalysis = await redis.get<PlayerAnalysis>(analysisCacheKey);
      if (cachedAnalysis) {
        return NextResponse.json(cachedAnalysis);
      }
    } catch (e) {
      console.warn('Redis cache error:', e);
    }

    // Determine queue ID based on parameter
    let queueId: number | undefined;
    let queueName = 'Ranked';

    switch (queueParam) {
      case 'solo':
        queueId = QUEUE_IDS.RANKED_SOLO;
        queueName = 'Solo/Duo';
        break;
      case 'flex':
        queueId = QUEUE_IDS.RANKED_FLEX;
        queueName = 'Flex';
        break;
      default:
        // For 'all', we'll fetch without queue filter but still filter results
        queueId = undefined;
        queueName = 'All Ranked';
    }

    // Fetch match IDs - get ranked games only for better analysis
    const matchIds = await getMatchIds(puuid, region, GAMES_TO_ANALYZE, queueId);

    if (matchIds.length === 0) {
      return NextResponse.json(
        { error: 'No matches found for analysis' },
        { status: 404 }
      );
    }

    // Fetch all match details in parallel
    const matchPromises = matchIds.map(async (matchId) => {
      try {
        return await getMatch(matchId, region);
      } catch {
        return null;
      }
    });

    let matches = (await Promise.all(matchPromises)).filter(
      (m): m is Match => m !== null
    );

    // If no specific queue was requested, filter to only ranked games
    if (!queueId) {
      matches = matches.filter((m) =>
        QUEUE_IDS.ALL_RANKED.includes(m.info.queueId as 420 | 440)
      );
    }

    if (matches.length === 0) {
      return NextResponse.json(
        { error: 'No ranked matches found for analysis' },
        { status: 404 }
      );
    }

    // Extract participant data for the player
    const playerMatches = matches.map((match) => {
      const participant = match.info.participants.find((p) => p.puuid === puuid);
      const team = match.info.teams.find((t) => t.teamId === participant?.teamId);
      const allParticipants = match.info.participants;
      return {
        match,
        participant: participant!,
        team: team!,
        allParticipants,
        gameDuration: match.info.gameDuration,
      };
    }).filter((pm) => pm.participant);

    // Calculate analysis (async - includes fetching champion benchmarks)
    const analysis = await calculateAnalysis(
      puuid,
      gameName,
      tagLine,
      region,
      playerMatches,
      queueName
    );

    // Cache the analysis result
    try {
      await redis.set(analysisCacheKey, analysis, { ex: CACHE_TTL.ANALYSIS });
    } catch (e) {
      console.warn('Redis cache write error:', e);
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Analysis API error:', error);

    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to generate analysis' },
      { status: 500 }
    );
  }
}

interface PlayerMatch {
  match: Match;
  participant: Participant;
  team: Team;
  allParticipants: Participant[];
  gameDuration: number;
}

async function calculateAnalysis(
  puuid: string,
  gameName: string,
  tagLine: string,
  region: string,
  playerMatches: PlayerMatch[],
  queueName: string
): Promise<PlayerAnalysis> {
  // Overall stats
  const overallStats = calculateOverallStats(playerMatches);

  // Per-role stats
  const roleStats = calculateRoleStats(playerMatches);

  // Champion analysis (async - fetches benchmarks from DB)
  const championAnalysis = await calculateChampionAnalysis(playerMatches);

  // Trends
  const trends = calculateTrends(playerMatches);

  // Identify strengths and weaknesses
  const { strengths, weaknesses } = identifyInsights(overallStats, roleStats, playerMatches);

  // Generate improvement suggestions
  const improvements = generateImprovements(weaknesses, roleStats, overallStats);

  // Calculate data quality based on number of games
  const gamesCount = playerMatches.length;
  let dataQuality: PlayerAnalysis['dataQuality'];
  if (gamesCount >= RECOMMENDED_GAMES_FOR_ANALYSIS) {
    dataQuality = 'excellent';
  } else if (gamesCount >= 30) {
    dataQuality = 'good';
  } else if (gamesCount >= MIN_GAMES_FOR_ANALYSIS) {
    dataQuality = 'limited';
  } else {
    dataQuality = 'insufficient';
  }

  return {
    puuid,
    gameName,
    tagLine,
    region,
    queueName,
    analyzedGames: playerMatches.length,
    dataQuality,
    overallStats,
    roleStats,
    championAnalysis,
    trends,
    strengths,
    weaknesses,
    improvements,
  };
}

function calculateOverallStats(playerMatches: PlayerMatch[]): OverallStats {
  const count = playerMatches.length;
  if (count === 0) {
    return getEmptyStats();
  }

  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  let totalCS = 0;
  let totalVision = 0;
  let totalDamage = 0;
  let totalDamageTaken = 0;
  let totalGold = 0;
  let totalDuration = 0;
  let wins = 0;
  let firstBloods = 0;
  let firstTowers = 0;
  let totalKP = 0;
  let totalDamageShare = 0;
  let totalGoldShare = 0;
  let multiKills = 0;

  // New challenge-based metrics
  let totalSoloKills = 0;
  let soloKillsCount = 0;
  let totalSkillshotsHit = 0;
  let skillshotsHitCount = 0;
  let totalSkillshotsDodged = 0;
  let skillshotsDodgedCount = 0;
  let totalTurretPlates = 0;
  let turretPlatesCount = 0;
  let totalDragonTakedowns = 0;
  let dragonTakedownsCount = 0;
  let totalControlWards = 0;
  let controlWardsCount = 0;
  let totalWardsKilled = 0;
  let totalEarlyGoldAdv = 0;
  let earlyGoldAdvCount = 0;
  let totalLaneMinions10 = 0;
  let laneMinions10Count = 0;
  // Pings
  let totalPings = 0;
  let totalMissingPings = 0;
  let totalDangerPings = 0;

  for (const pm of playerMatches) {
    const p = pm.participant;
    const challenges = p.challenges;
    const teamParticipants = pm.allParticipants.filter(
      (ap) => ap.teamId === p.teamId
    );

    totalKills += p.kills;
    totalDeaths += p.deaths;
    totalAssists += p.assists;
    totalCS += p.totalMinionsKilled + p.neutralMinionsKilled;
    totalVision += p.visionScore;
    totalDamage += p.totalDamageDealtToChampions;
    totalDamageTaken += p.totalDamageTaken;
    totalGold += p.goldEarned;
    totalDuration += pm.gameDuration;

    if (p.win) wins++;
    if (p.firstBloodKill || p.firstBloodAssist) firstBloods++;
    if (p.firstTowerKill || p.firstTowerAssist) firstTowers++;

    // Multi-kills
    if (p.doubleKills > 0 || p.tripleKills > 0 || p.quadraKills > 0 || p.pentaKills > 0) {
      multiKills++;
    }

    // Kill participation
    const teamKills = teamParticipants.reduce((sum, tp) => sum + tp.kills, 0);
    if (teamKills > 0) {
      totalKP += (p.kills + p.assists) / teamKills;
    }

    // Damage share
    const teamDamage = teamParticipants.reduce(
      (sum, tp) => sum + tp.totalDamageDealtToChampions,
      0
    );
    if (teamDamage > 0) {
      totalDamageShare += p.totalDamageDealtToChampions / teamDamage;
    }

    // Gold share
    const teamGold = teamParticipants.reduce((sum, tp) => sum + tp.goldEarned, 0);
    if (teamGold > 0) {
      totalGoldShare += p.goldEarned / teamGold;
    }

    // Challenge-based metrics
    if (challenges) {
      if (challenges.soloKills !== undefined) {
        totalSoloKills += challenges.soloKills;
        soloKillsCount++;
      }
      if (challenges.skillshotsHit !== undefined) {
        totalSkillshotsHit += challenges.skillshotsHit;
        skillshotsHitCount++;
      }
      if (challenges.skillshotsDodged !== undefined) {
        totalSkillshotsDodged += challenges.skillshotsDodged;
        skillshotsDodgedCount++;
      }
      if (challenges.turretPlatesTaken !== undefined) {
        totalTurretPlates += challenges.turretPlatesTaken;
        turretPlatesCount++;
      }
      if (challenges.dragonTakedowns !== undefined) {
        totalDragonTakedowns += challenges.dragonTakedowns;
        dragonTakedownsCount++;
      }
      if (challenges.controlWardsPlaced !== undefined) {
        totalControlWards += challenges.controlWardsPlaced;
        controlWardsCount++;
      }
      if (challenges.earlyLaningPhaseGoldExpAdvantage !== undefined) {
        totalEarlyGoldAdv += challenges.earlyLaningPhaseGoldExpAdvantage;
        earlyGoldAdvCount++;
      }
      if (challenges.laneMinionsFirst10Minutes !== undefined) {
        totalLaneMinions10 += challenges.laneMinionsFirst10Minutes;
        laneMinions10Count++;
      }
    }

    // Ward kills
    totalWardsKilled += p.wardsKilled;

    // Pings
    if (p.allInPings !== undefined) totalPings += p.allInPings;
    if (p.assistMePings !== undefined) totalPings += p.assistMePings;
    if (p.dangerPings !== undefined) {
      totalPings += p.dangerPings;
      totalDangerPings += p.dangerPings;
    }
    if (p.enemyMissingPings !== undefined) {
      totalPings += p.enemyMissingPings;
      totalMissingPings += p.enemyMissingPings;
    }
    if (p.onMyWayPings !== undefined) totalPings += p.onMyWayPings;
    if (p.pushPings !== undefined) totalPings += p.pushPings;
  }

  const avgDuration = totalDuration / count / 60; // in minutes

  return {
    winRate: (wins / count) * 100,
    avgKDA: totalDeaths === 0 ? totalKills + totalAssists : (totalKills + totalAssists) / totalDeaths,
    avgKills: totalKills / count,
    avgDeaths: totalDeaths / count,
    avgAssists: totalAssists / count,
    avgCS: totalCS / count,
    avgCSPerMin: totalCS / count / avgDuration,
    avgVisionScore: totalVision / count,
    avgVisionPerMin: totalVision / count / avgDuration,
    avgDamageDealt: totalDamage / count,
    avgDamagePerMin: totalDamage / count / avgDuration,
    avgDamageTaken: totalDamageTaken / count,
    avgGoldEarned: totalGold / count,
    avgGoldPerMin: totalGold / count / avgDuration,
    avgKillParticipation: (totalKP / count) * 100,
    avgDamageShare: (totalDamageShare / count) * 100,
    avgGoldShare: (totalGoldShare / count) * 100,
    firstBloodRate: (firstBloods / count) * 100,
    firstTowerRate: (firstTowers / count) * 100,
    objectiveParticipation: dragonTakedownsCount > 0 ? (totalDragonTakedowns / dragonTakedownsCount) : 0,
    multiKillRate: (multiKills / count) * 100,
    avgGameDuration: avgDuration,
    // New challenge-based metrics
    avgSoloKills: soloKillsCount > 0 ? totalSoloKills / soloKillsCount : undefined,
    avgSkillshotsHit: skillshotsHitCount > 0 ? totalSkillshotsHit / skillshotsHitCount : undefined,
    avgSkillshotsDodged: skillshotsDodgedCount > 0 ? totalSkillshotsDodged / skillshotsDodgedCount : undefined,
    avgTurretPlatesTaken: turretPlatesCount > 0 ? totalTurretPlates / turretPlatesCount : undefined,
    avgDragonTakedowns: dragonTakedownsCount > 0 ? totalDragonTakedowns / dragonTakedownsCount : undefined,
    avgControlWardsPlaced: controlWardsCount > 0 ? totalControlWards / controlWardsCount : undefined,
    avgWardsKilled: totalWardsKilled / count,
    avgEarlyGoldAdvantage: earlyGoldAdvCount > 0 ? totalEarlyGoldAdv / earlyGoldAdvCount : undefined,
    avgLaneMinionsFirst10Min: laneMinions10Count > 0 ? totalLaneMinions10 / laneMinions10Count : undefined,
    avgPingsPerGame: totalPings / count,
    avgMissingPings: totalMissingPings / count,
    avgDangerPings: totalDangerPings / count,
  };
}

function calculateRoleStats(playerMatches: PlayerMatch[]): Record<string, RoleStats> {
  const roleMap: Record<string, PlayerMatch[]> = {};

  for (const pm of playerMatches) {
    const role = normalizeRole(pm.participant.teamPosition || pm.participant.individualPosition);
    if (!roleMap[role]) {
      roleMap[role] = [];
    }
    roleMap[role].push(pm);
  }

  const result: Record<string, RoleStats> = {};

  for (const [role, matches] of Object.entries(roleMap)) {
    const baseStats = calculateOverallStats(matches);
    const benchmark = ROLE_BENCHMARKS[role] || ROLE_BENCHMARKS.MIDDLE;

    const benchmarkComparison: BenchmarkComparison = {
      csPerMin: {
        value: baseStats.avgCSPerMin,
        benchmark: benchmark.csPerMin,
        percentile: getPercentile(baseStats.avgCSPerMin, benchmark.csPerMin),
        rating: getRating(baseStats.avgCSPerMin, benchmark.csPerMin),
      },
      visionScore: {
        value: baseStats.avgVisionPerMin,
        benchmark: benchmark.visionPerMin,
        percentile: getPercentile(baseStats.avgVisionPerMin, benchmark.visionPerMin),
        rating: getRating(baseStats.avgVisionPerMin, benchmark.visionPerMin),
      },
      kda: {
        value: baseStats.avgKDA,
        benchmark: benchmark.kda,
        percentile: getPercentile(baseStats.avgKDA, benchmark.kda),
        rating: getRating(baseStats.avgKDA, benchmark.kda),
      },
      damageShare: {
        value: baseStats.avgDamageShare / 100,
        benchmark: benchmark.damageShare,
        percentile: getPercentile(baseStats.avgDamageShare / 100, benchmark.damageShare),
        rating: getRating(baseStats.avgDamageShare / 100, benchmark.damageShare),
      },
      goldEfficiency: {
        value: baseStats.avgGoldPerMin,
        benchmark: 400, // Approximate gold/min benchmark
        percentile: getPercentile(baseStats.avgGoldPerMin, 400),
        rating: getRating(baseStats.avgGoldPerMin, 400),
      },
      killParticipation: {
        value: baseStats.avgKillParticipation / 100,
        benchmark: benchmark.killParticipation,
        percentile: getPercentile(baseStats.avgKillParticipation / 100, benchmark.killParticipation),
        rating: getRating(baseStats.avgKillParticipation / 100, benchmark.killParticipation),
      },
    };

    result[role] = {
      ...baseStats,
      role,
      games: matches.length,
      benchmarkComparison,
    };
  }

  return result;
}

async function calculateChampionAnalysis(playerMatches: PlayerMatch[]): Promise<ChampionAnalysis[]> {
  const championMap: Record<string, PlayerMatch[]> = {};

  for (const pm of playerMatches) {
    const champName = pm.participant.championName;
    if (!championMap[champName]) {
      championMap[champName] = [];
    }
    championMap[champName].push(pm);
  }

  const results: ChampionAnalysis[] = [];

  for (const [championName, matches] of Object.entries(championMap)) {
    const wins = matches.filter((m) => m.participant.win).length;
    const championId = matches[0].participant.championId;

    // Determine main role for this champion
    const roleCount: Record<string, number> = {};
    for (const m of matches) {
      const role = normalizeRole(m.participant.teamPosition || m.participant.individualPosition);
      roleCount[role] = (roleCount[role] || 0) + 1;
    }
    const mainRole = Object.entries(roleCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'MIDDLE';

    // Calculate stats
    let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalCS = 0;
    let totalDamage = 0, totalVision = 0, totalGold = 0, totalDuration = 0;
    let totalKP = 0, kpCount = 0;
    let totalDamageShare = 0, dmgShareCount = 0;
    let totalSoloKills = 0, soloKillsCount = 0;
    let totalSkillshotsHit = 0, skillshotsHitCount = 0;
    let totalSkillshotsDodged = 0, skillshotsDodgedCount = 0;
    let totalControlWards = 0, controlWardsCount = 0;
    let totalTurretPlates = 0, turretPlatesCount = 0;

    for (const m of matches) {
      const p = m.participant;
      const challenges = p.challenges;
      const teamParticipants = m.allParticipants.filter(ap => ap.teamId === p.teamId);

      totalKills += p.kills;
      totalDeaths += p.deaths;
      totalAssists += p.assists;
      totalCS += p.totalMinionsKilled + p.neutralMinionsKilled;
      totalDamage += p.totalDamageDealtToChampions;
      totalVision += p.visionScore;
      totalGold += p.goldEarned;
      totalDuration += m.gameDuration;

      // KP
      const teamKills = teamParticipants.reduce((sum, tp) => sum + tp.kills, 0);
      if (teamKills > 0) {
        totalKP += (p.kills + p.assists) / teamKills;
        kpCount++;
      }

      // Damage share
      const teamDamage = teamParticipants.reduce((sum, tp) => sum + tp.totalDamageDealtToChampions, 0);
      if (teamDamage > 0) {
        totalDamageShare += p.totalDamageDealtToChampions / teamDamage;
        dmgShareCount++;
      }

      // Challenges
      if (challenges) {
        if (challenges.soloKills !== undefined) { totalSoloKills += challenges.soloKills; soloKillsCount++; }
        if (challenges.skillshotsHit !== undefined) { totalSkillshotsHit += challenges.skillshotsHit; skillshotsHitCount++; }
        if (challenges.skillshotsDodged !== undefined) { totalSkillshotsDodged += challenges.skillshotsDodged; skillshotsDodgedCount++; }
        if (challenges.controlWardsPlaced !== undefined) { totalControlWards += challenges.controlWardsPlaced; controlWardsCount++; }
        if (challenges.turretPlatesTaken !== undefined) { totalTurretPlates += challenges.turretPlatesTaken; turretPlatesCount++; }
      }
    }

    const count = matches.length;
    const avgDuration = totalDuration / count / 60;
    const avgKda = totalDeaths === 0 ? totalKills + totalAssists : (totalKills + totalAssists) / totalDeaths;

    // Find best and worst performance
    const sortedByKDA = [...matches].sort((a, b) => getKDA(b.participant) - getKDA(a.participant));
    const best = sortedByKDA[0];
    const worst = sortedByKDA[sortedByKDA.length - 1];

    // Fetch high elo benchmark for this champion/role
    let highEloComparison: ChampionHighEloComparison | undefined;
    try {
      const benchmark = await db.query.championBenchmarks.findFirst({
        where: and(
          eq(championBenchmarks.championId, championId),
          eq(championBenchmarks.role, mainRole)
        ),
      });

      if (benchmark && benchmark.gamesAnalyzed >= 5) {
        highEloComparison = buildHighEloComparison(
          {
            winRate: (wins / count) * 100,
            kda: avgKda,
            csPerMin: totalCS / count / avgDuration,
            damagePerMin: totalDamage / count / avgDuration,
            goldPerMin: totalGold / count / avgDuration,
            visionPerMin: totalVision / count / avgDuration,
            killParticipation: kpCount > 0 ? (totalKP / kpCount) * 100 : 0,
            damageShare: dmgShareCount > 0 ? (totalDamageShare / dmgShareCount) * 100 : 0,
            soloKills: soloKillsCount > 0 ? totalSoloKills / soloKillsCount : 0,
            skillshotsHit: skillshotsHitCount > 0 ? totalSkillshotsHit / skillshotsHitCount : undefined,
            controlWards: controlWardsCount > 0 ? totalControlWards / controlWardsCount : 0,
          },
          benchmark
        );
      }
    } catch (e) {
      // Benchmark not available, continue without
    }

    results.push({
      championId,
      championName,
      role: mainRole,
      games: count,
      wins,
      losses: count - wins,
      winRate: (wins / count) * 100,
      avgKDA: avgKda,
      avgKills: totalKills / count,
      avgDeaths: totalDeaths / count,
      avgAssists: totalAssists / count,
      avgCS: totalCS / count,
      avgCSPerMin: totalCS / count / avgDuration,
      avgDamage: totalDamage / count,
      avgDamagePerMin: totalDamage / count / avgDuration,
      avgVision: totalVision / count,
      avgVisionPerMin: totalVision / count / avgDuration,
      avgGoldPerMin: totalGold / count / avgDuration,
      avgKillParticipation: kpCount > 0 ? (totalKP / kpCount) * 100 : 0,
      avgDamageShare: dmgShareCount > 0 ? (totalDamageShare / dmgShareCount) * 100 : 0,
      avgSoloKills: soloKillsCount > 0 ? totalSoloKills / soloKillsCount : 0,
      avgSkillshotsHit: skillshotsHitCount > 0 ? totalSkillshotsHit / skillshotsHitCount : 0,
      avgSkillshotsDodged: skillshotsDodgedCount > 0 ? totalSkillshotsDodged / skillshotsDodgedCount : 0,
      avgControlWardsPlaced: controlWardsCount > 0 ? totalControlWards / controlWardsCount : 0,
      avgTurretPlatesTaken: turretPlatesCount > 0 ? totalTurretPlates / turretPlatesCount : 0,
      highEloComparison,
      bestPerformance: best ? {
        matchId: best.match.metadata.matchId,
        kda: getKDA(best.participant),
        kills: best.participant.kills,
        deaths: best.participant.deaths,
        assists: best.participant.assists,
        cs: best.participant.totalMinionsKilled + best.participant.neutralMinionsKilled,
        damage: best.participant.totalDamageDealtToChampions,
        win: best.participant.win,
        gameCreation: best.match.info.gameCreation,
      } : null,
      worstPerformance: worst && sortedByKDA.length > 1 ? {
        matchId: worst.match.metadata.matchId,
        kda: getKDA(worst.participant),
        kills: worst.participant.kills,
        deaths: worst.participant.deaths,
        assists: worst.participant.assists,
        cs: worst.participant.totalMinionsKilled + worst.participant.neutralMinionsKilled,
        damage: worst.participant.totalDamageDealtToChampions,
        win: worst.participant.win,
        gameCreation: worst.match.info.gameCreation,
      } : null,
    });
  }

  return results.sort((a, b) => b.games - a.games);
}

// Build high elo comparison from player stats and benchmark
function buildHighEloComparison(
  playerStats: {
    winRate: number;
    kda: number;
    csPerMin: number;
    damagePerMin: number;
    goldPerMin: number;
    visionPerMin: number;
    killParticipation: number;
    damageShare: number;
    soloKills: number;
    skillshotsHit?: number;
    controlWards: number;
  },
  benchmark: typeof championBenchmarks.$inferSelect
): ChampionHighEloComparison {
  const createMetric = (playerValue: number, benchmarkValue: number | null): ComparisonMetric => {
    const highEloValue = benchmarkValue ? benchmarkValue / 100 : 0;
    const diff = highEloValue > 0 ? ((playerValue - highEloValue) / highEloValue) * 100 : 0;
    const percentile = getComparisonPercentile(playerValue, highEloValue);
    return {
      playerValue,
      highEloValue,
      difference: diff,
      percentile,
      rating: getRating(playerValue, highEloValue || 1),
    };
  };

  const metrics = {
    winRate: createMetric(playerStats.winRate, benchmark.winRate),
    kda: createMetric(playerStats.kda, benchmark.avgKda),
    csPerMin: createMetric(playerStats.csPerMin, benchmark.avgCsPerMin),
    damagePerMin: createMetric(playerStats.damagePerMin, benchmark.avgDamagePerMin),
    goldPerMin: createMetric(playerStats.goldPerMin, benchmark.avgGoldPerMin),
    visionPerMin: createMetric(playerStats.visionPerMin, benchmark.avgVisionScorePerMin),
    killParticipation: createMetric(playerStats.killParticipation, benchmark.avgKillParticipation),
    damageShare: createMetric(playerStats.damageShare, benchmark.avgDamageShare),
    soloKills: createMetric(playerStats.soloKills, benchmark.avgSoloKills),
    skillshotsHit: playerStats.skillshotsHit !== undefined && benchmark.avgSkillshotsHit
      ? createMetric(playerStats.skillshotsHit, benchmark.avgSkillshotsHit * 100)
      : undefined,
    controlWards: createMetric(playerStats.controlWards, benchmark.avgControlWardsPlaced),
  };

  // Calculate overall rating
  const scores = [
    metrics.winRate.percentile,
    metrics.kda.percentile,
    metrics.csPerMin.percentile,
    metrics.damagePerMin.percentile,
    metrics.killParticipation.percentile,
  ];
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  let overallRating: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  if (avgScore >= 90) overallRating = 'S';
  else if (avgScore >= 75) overallRating = 'A';
  else if (avgScore >= 60) overallRating = 'B';
  else if (avgScore >= 45) overallRating = 'C';
  else if (avgScore >= 30) overallRating = 'D';
  else overallRating = 'F';

  return {
    tier: 'ALL_RANKS',
    gamesAnalyzed: benchmark.gamesAnalyzed,
    metrics,
    overallRating,
    percentile: avgScore,
  };
}

function getComparisonPercentile(playerValue: number, benchmarkValue: number): number {
  if (benchmarkValue === 0) return 50;
  const ratio = playerValue / benchmarkValue;
  if (ratio >= 1.5) return 95;
  if (ratio >= 1.3) return 85;
  if (ratio >= 1.15) return 75;
  if (ratio >= 1.0) return 60;
  if (ratio >= 0.9) return 45;
  if (ratio >= 0.8) return 35;
  if (ratio >= 0.7) return 25;
  return 15;
}

function calculateTrends(playerMatches: PlayerMatch[]): PerformanceTrends {
  // Split into chunks of 5 games (most recent first)
  const chunkSize = 5;
  const chunks: PlayerMatch[][] = [];

  for (let i = 0; i < Math.min(20, playerMatches.length); i += chunkSize) {
    chunks.push(playerMatches.slice(i, i + chunkSize));
  }

  const recentKDA: number[] = [];
  const recentWinRate: number[] = [];
  const recentCS: number[] = [];
  const recentVision: number[] = [];
  const recentDamage: number[] = [];

  for (const chunk of chunks) {
    const stats = calculateOverallStats(chunk);
    recentKDA.push(stats.avgKDA);
    recentWinRate.push(stats.winRate);
    recentCS.push(stats.avgCSPerMin);
    recentVision.push(stats.avgVisionPerMin);
    recentDamage.push(stats.avgDamagePerMin);
  }

  return {
    recentKDA,
    recentWinRate,
    recentCS,
    recentVision,
    recentDamage,
    kdaTrend: getTrend(recentKDA),
    winRateTrend: getTrend(recentWinRate),
    csTrend: getTrend(recentCS),
    visionTrend: getTrend(recentVision),
  };
}

function identifyInsights(
  overallStats: OverallStats,
  roleStats: Record<string, RoleStats>,
  playerMatches: PlayerMatch[]
): { strengths: AnalysisInsight[]; weaknesses: AnalysisInsight[] } {
  const strengths: AnalysisInsight[] = [];
  const weaknesses: AnalysisInsight[] = [];

  // Get main role
  const mainRole = Object.entries(roleStats).sort((a, b) => b[1].games - a[1].games)[0];
  const mainRoleStats = mainRole?.[1];
  const benchmark = mainRoleStats?.benchmarkComparison;

  if (benchmark) {
    // KDA Analysis
    if (benchmark.kda.rating === 'excellent' || benchmark.kda.rating === 'good') {
      strengths.push({
        category: 'combat',
        title: 'Strong KDA',
        description: `Your KDA of ${overallStats.avgKDA.toFixed(2)} is ${benchmark.kda.rating === 'excellent' ? 'excellent' : 'above average'} for your role.`,
        value: overallStats.avgKDA,
        comparison: `Top ${100 - benchmark.kda.percentile}% of players`,
        importance: 'high',
      });
    } else if (benchmark.kda.rating === 'below_average' || benchmark.kda.rating === 'poor') {
      weaknesses.push({
        category: 'combat',
        title: 'Low KDA',
        description: `Your KDA of ${overallStats.avgKDA.toFixed(2)} is below average. Focus on reducing deaths.`,
        value: overallStats.avgKDA,
        comparison: `Target: ${benchmark.kda.benchmark.toFixed(2)}`,
        importance: 'high',
      });
    }

    // CS Analysis
    if (benchmark.csPerMin.rating === 'excellent' || benchmark.csPerMin.rating === 'good') {
      strengths.push({
        category: 'farming',
        title: 'Excellent Farming',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min is great for your role.`,
        value: overallStats.avgCSPerMin,
        comparison: `Top ${100 - benchmark.csPerMin.percentile}% of players`,
        importance: 'high',
      });
    } else if (benchmark.csPerMin.rating === 'below_average' || benchmark.csPerMin.rating === 'poor') {
      weaknesses.push({
        category: 'farming',
        title: 'Low CS',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min is below average. Practice last-hitting.`,
        value: overallStats.avgCSPerMin,
        comparison: `Target: ${benchmark.csPerMin.benchmark.toFixed(1)} CS/min`,
        importance: 'high',
      });
    }

    // Vision Analysis
    if (benchmark.visionScore.rating === 'excellent' || benchmark.visionScore.rating === 'good') {
      strengths.push({
        category: 'vision',
        title: 'Great Vision Control',
        description: `Your vision score of ${overallStats.avgVisionPerMin.toFixed(2)}/min shows strong map awareness.`,
        value: overallStats.avgVisionPerMin,
        comparison: `Top ${100 - benchmark.visionScore.percentile}% of players`,
        importance: 'medium',
      });
    } else if (benchmark.visionScore.rating === 'below_average' || benchmark.visionScore.rating === 'poor') {
      weaknesses.push({
        category: 'vision',
        title: 'Low Vision Score',
        description: `Your vision score is below average. Buy more control wards and use trinkets.`,
        value: overallStats.avgVisionPerMin,
        comparison: `Target: ${benchmark.visionScore.benchmark.toFixed(2)}/min`,
        importance: 'medium',
      });
    }

    // Kill Participation
    if (benchmark.killParticipation.rating === 'excellent' || benchmark.killParticipation.rating === 'good') {
      strengths.push({
        category: 'teamplay',
        title: 'High Kill Participation',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% KP shows great team involvement.`,
        value: overallStats.avgKillParticipation,
        importance: 'medium',
      });
    } else if (benchmark.killParticipation.rating === 'below_average' || benchmark.killParticipation.rating === 'poor') {
      weaknesses.push({
        category: 'teamplay',
        title: 'Low Kill Participation',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% KP is low. Join more team fights.`,
        value: overallStats.avgKillParticipation,
        comparison: `Target: ${(benchmark.killParticipation.benchmark * 100).toFixed(0)}%`,
        importance: 'medium',
      });
    }
  }

  // Death analysis
  if (overallStats.avgDeaths > 5) {
    weaknesses.push({
      category: 'survivability',
      title: 'High Death Count',
      description: `Averaging ${overallStats.avgDeaths.toFixed(1)} deaths per game. Focus on positioning and map awareness.`,
      value: overallStats.avgDeaths,
      comparison: 'Target: < 4 deaths/game',
      importance: 'high',
    });
  } else if (overallStats.avgDeaths < 3) {
    strengths.push({
      category: 'survivability',
      title: 'Low Deaths',
      description: `Only ${overallStats.avgDeaths.toFixed(1)} deaths per game shows excellent survivability.`,
      value: overallStats.avgDeaths,
      importance: 'medium',
    });
  }

  // First blood rate
  if (overallStats.firstBloodRate > 30) {
    strengths.push({
      category: 'aggression',
      title: 'First Blood Threat',
      description: `Involved in first blood ${overallStats.firstBloodRate.toFixed(0)}% of games.`,
      value: overallStats.firstBloodRate,
      importance: 'low',
    });
  }

  // Consistency check
  const winRateVariance = calculateConsistency(playerMatches);
  if (winRateVariance < 0.3) {
    strengths.push({
      category: 'consistency',
      title: 'Consistent Performance',
      description: 'Your performance is stable across games.',
      value: winRateVariance,
      importance: 'medium',
    });
  } else if (winRateVariance > 0.5) {
    weaknesses.push({
      category: 'consistency',
      title: 'Inconsistent Performance',
      description: 'Your performance varies significantly between games.',
      value: winRateVariance,
      importance: 'medium',
    });
  }

  return { strengths, weaknesses };
}

function generateImprovements(
  weaknesses: AnalysisInsight[],
  roleStats: Record<string, RoleStats>,
  overallStats: OverallStats
): ImprovementSuggestion[] {
  const improvements: ImprovementSuggestion[] = [];

  for (const weakness of weaknesses) {
    let suggestion: ImprovementSuggestion | null = null;

    switch (weakness.category) {
      case 'combat':
        suggestion = {
          priority: 1,
          category: 'combat',
          title: 'Improve KDA',
          description: 'Focus on reducing deaths while maintaining kill participation.',
          currentValue: overallStats.avgKDA,
          targetValue: 2.5,
          tips: [
            'Wait for cooldowns before engaging',
            'Track enemy key abilities',
            'Position safely in team fights',
            'Avoid chasing kills too deep',
          ],
        };
        break;

      case 'farming':
        suggestion = {
          priority: 1,
          category: 'farming',
          title: 'Improve CS',
          description: 'Better last-hitting will significantly increase your gold income.',
          currentValue: overallStats.avgCSPerMin,
          targetValue: 7.5,
          tips: [
            'Practice last-hitting in practice tool',
            'Learn wave manipulation (freeze, slow push, fast push)',
            'Don\'t miss CS while trading',
            'Catch side waves after laning phase',
          ],
        };
        break;

      case 'vision':
        suggestion = {
          priority: 2,
          category: 'vision',
          title: 'Improve Vision Control',
          description: 'Better vision leads to better map awareness and fewer deaths.',
          currentValue: overallStats.avgVisionPerMin,
          targetValue: 1.0,
          tips: [
            'Buy a control ward every back',
            'Use trinket on cooldown',
            'Ward before objectives spawn',
            'Clear enemy vision before fights',
          ],
        };
        break;

      case 'survivability':
        suggestion = {
          priority: 1,
          category: 'survivability',
          title: 'Reduce Deaths',
          description: 'Dying less means more time on the map farming and fighting.',
          currentValue: overallStats.avgDeaths,
          targetValue: 4,
          tips: [
            'Check minimap every few seconds',
            'Track enemy jungler',
            'Don\'t overextend without vision',
            'Know your champion\'s limits',
          ],
        };
        break;

      case 'teamplay':
        suggestion = {
          priority: 2,
          category: 'teamplay',
          title: 'Increase Kill Participation',
          description: 'Being more involved in fights helps your team win.',
          currentValue: overallStats.avgKillParticipation,
          targetValue: 60,
          tips: [
            'Rotate to fights when possible',
            'Use TP/mobility to join skirmishes',
            'Communicate with pings',
            'Group with team after laning phase',
          ],
        };
        break;

      case 'consistency':
        suggestion = {
          priority: 3,
          category: 'consistency',
          title: 'Improve Consistency',
          description: 'Stable performance leads to more reliable climbing.',
          currentValue: weakness.value,
          targetValue: 0.3,
          tips: [
            'Stick to 2-3 champions',
            'Review replays of losses',
            'Don\'t play tilted',
            'Focus on fundamentals every game',
          ],
        };
        break;
    }

    if (suggestion) {
      improvements.push(suggestion);
    }
  }

  return improvements.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

// Helper functions
function normalizeRole(position: string): string {
  const roleMap: Record<string, string> = {
    TOP: 'TOP',
    JUNGLE: 'JUNGLE',
    MIDDLE: 'MIDDLE',
    MID: 'MIDDLE',
    BOTTOM: 'BOTTOM',
    ADC: 'BOTTOM',
    UTILITY: 'UTILITY',
    SUPPORT: 'UTILITY',
    '': 'MIDDLE', // Default
  };
  return roleMap[position.toUpperCase()] || 'MIDDLE';
}

function getKDA(participant: Participant): number {
  return participant.deaths === 0
    ? participant.kills + participant.assists
    : (participant.kills + participant.assists) / participant.deaths;
}

function getTrend(values: number[]): 'improving' | 'stable' | 'declining' {
  if (values.length < 2) return 'stable';

  // Compare first half average to second half average
  const mid = Math.floor(values.length / 2);
  const recent = values.slice(0, mid);
  const older = values.slice(mid);

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const change = (recentAvg - olderAvg) / olderAvg;

  if (change > 0.1) return 'improving';
  if (change < -0.1) return 'declining';
  return 'stable';
}

function calculateConsistency(playerMatches: PlayerMatch[]): number {
  if (playerMatches.length < 5) return 0.5;

  const kdas = playerMatches.map((pm) => getKDA(pm.participant));
  const mean = kdas.reduce((a, b) => a + b, 0) / kdas.length;
  const variance = kdas.reduce((sum, kda) => sum + Math.pow(kda - mean, 2), 0) / kdas.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (normalized standard deviation)
  return stdDev / mean;
}

function getEmptyStats(): OverallStats {
  return {
    winRate: 0,
    avgKDA: 0,
    avgKills: 0,
    avgDeaths: 0,
    avgAssists: 0,
    avgCS: 0,
    avgCSPerMin: 0,
    avgVisionScore: 0,
    avgVisionPerMin: 0,
    avgDamageDealt: 0,
    avgDamagePerMin: 0,
    avgDamageTaken: 0,
    avgGoldEarned: 0,
    avgGoldPerMin: 0,
    avgKillParticipation: 0,
    avgDamageShare: 0,
    avgGoldShare: 0,
    firstBloodRate: 0,
    firstTowerRate: 0,
    objectiveParticipation: 0,
    multiKillRate: 0,
    avgGameDuration: 0,
    // New challenge-based metrics
    avgSoloKills: undefined,
    avgSkillshotsHit: undefined,
    avgSkillshotsDodged: undefined,
    avgTurretPlatesTaken: undefined,
    avgDragonTakedowns: undefined,
    avgControlWardsPlaced: undefined,
    avgWardsKilled: 0,
    avgEarlyGoldAdvantage: undefined,
    avgLaneMinionsFirst10Min: undefined,
    avgPingsPerGame: 0,
    avgMissingPings: 0,
    avgDangerPings: 0,
  };
}
