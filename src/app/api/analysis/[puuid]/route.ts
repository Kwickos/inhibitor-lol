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
  const mainRoleName = mainRole?.[0] || 'MIDDLE';
  const mainRoleStats = mainRole?.[1];
  const benchmark = mainRoleStats?.benchmarkComparison;

  // Analyze death patterns
  const deathAnalysis = analyzeDeathPatterns(playerMatches);

  // Analyze early game
  const earlyGameAnalysis = analyzeEarlyGame(playerMatches, mainRoleName);

  // ========== ROLE-SPECIFIC INSIGHTS ==========

  if (mainRoleName === 'JUNGLE') {
    // Jungle-specific analysis
    if (overallStats.avgKillParticipation > 65) {
      strengths.push({
        category: 'teamplay',
        title: 'Présence jungle oppressante',
        description: `Avec ${overallStats.avgKillParticipation.toFixed(0)}% de KP, tu es présent sur toutes les actions. Tu comprends quand roam et quand farmer.`,
        value: overallStats.avgKillParticipation,
        importance: 'high',
      });
    } else if (overallStats.avgKillParticipation < 50) {
      weaknesses.push({
        category: 'teamplay',
        title: 'Jungle fantôme',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% de KP, tu farm ta jungle pendant que tes laners se font dive. Track les timers adverses et gank quand tes lanes ont setup la wave.`,
        value: overallStats.avgKillParticipation,
        importance: 'high',
      });
    }

    if (overallStats.avgDragonTakedowns && overallStats.avgDragonTakedowns > 2) {
      strengths.push({
        category: 'objectives',
        title: 'Dragon Soul focus',
        description: `${overallStats.avgDragonTakedowns.toFixed(1)} dragons/game en moyenne. Tu priorises bien les objectifs et tu setup la vision avant les spawns.`,
        value: overallStats.avgDragonTakedowns,
        importance: 'high',
      });
    }

    if (overallStats.avgVisionPerMin < 0.8) {
      weaknesses.push({
        category: 'vision',
        title: 'Jungle sans vision',
        description: `${overallStats.avgVisionPerMin.toFixed(2)} vision/min c'est insuffisant. Place des pinks dans la jungle ennemie, sweep les objectifs 1min avant spawn.`,
        value: overallStats.avgVisionPerMin,
        importance: 'medium',
      });
    }
  }

  if (mainRoleName === 'UTILITY') {
    // Support-specific analysis
    if (overallStats.avgVisionPerMin > 2.0) {
      strengths.push({
        category: 'vision',
        title: 'Vision de pro',
        description: `${overallStats.avgVisionPerMin.toFixed(2)} vision/min, ta vision contrôle la map. Tu ward les flancs en teamfight et tu track le jungler adverse.`,
        value: overallStats.avgVisionPerMin,
        importance: 'high',
      });
    } else if (overallStats.avgVisionPerMin < 1.5) {
      weaknesses.push({
        category: 'vision',
        title: 'Support sans wards',
        description: `${overallStats.avgVisionPerMin.toFixed(2)} vision/min pour un support c'est critique. Utilise ton item support + pinks. Ward river level 1, tribush après le push.`,
        value: overallStats.avgVisionPerMin,
        importance: 'high',
      });
    }

    if (overallStats.avgKillParticipation > 70) {
      strengths.push({
        category: 'teamplay',
        title: 'Support omniprésent',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% KP, tu es partout. Tes roams mid sont timés et tu suis les engages de ton jungler.`,
        value: overallStats.avgKillParticipation,
        importance: 'high',
      });
    }

    if (overallStats.avgDeaths > 5) {
      weaknesses.push({
        category: 'survivability',
        title: 'Support kamikaze',
        description: `${overallStats.avgDeaths.toFixed(1)} morts/game, tu engage sans backup ou tu facecheck sans vision. En tant que support, ta mort = ton ADC est solo.`,
        value: overallStats.avgDeaths,
        importance: 'high',
      });
    }
  }

  if (mainRoleName === 'BOTTOM') {
    // ADC-specific analysis
    if (benchmark?.csPerMin.rating === 'excellent' || (overallStats.avgCSPerMin > 8.5)) {
      strengths.push({
        category: 'farming',
        title: 'Farming d\'ADC clean',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min, tu last-hit bien et tu catch les waves sides. Tu atteins tes power spikes en temps et en heure.`,
        value: overallStats.avgCSPerMin,
        importance: 'high',
      });
    } else if (overallStats.avgCSPerMin < 7) {
      weaknesses.push({
        category: 'farming',
        title: 'CS d\'ADC insuffisant',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min c'est 1.5 items de retard à 25min. Travaille le last-hit sous tour (2 auto tower + 1 auto, ou 1 auto + tower + 1 auto pour les casters).`,
        value: overallStats.avgCSPerMin,
        importance: 'high',
      });
    }

    if (overallStats.avgDamageShare > 28) {
      strengths.push({
        category: 'combat',
        title: 'Carry damage',
        description: `${overallStats.avgDamageShare.toFixed(0)}% du damage de ton équipe. Tu DPS en teamfight sans te faire OS, tu kite bien.`,
        value: overallStats.avgDamageShare,
        importance: 'high',
      });
    } else if (overallStats.avgDamageShare < 22) {
      weaknesses.push({
        category: 'combat',
        title: 'ADC sans damage',
        description: `${overallStats.avgDamageShare.toFixed(0)}% damage share pour un ADC c'est trop peu. Tu te positionnes trop loin ou tu arrive trop tard aux fights. Stay max range et auto le plus proche.`,
        value: overallStats.avgDamageShare,
        importance: 'high',
      });
    }

    if (deathAnalysis.avgDeathsFirst15Min > 2) {
      weaknesses.push({
        category: 'survivability',
        title: 'Laning phase suicidaire',
        description: `${deathAnalysis.avgDeathsFirst15Min.toFixed(1)} morts avant 15min. Tu te fais gank ou tu prends des trades perdants. Freeze devant ta tour si tu es behind, ward le tribush.`,
        value: deathAnalysis.avgDeathsFirst15Min,
        importance: 'high',
      });
    }
  }

  if (mainRoleName === 'MIDDLE') {
    // Mid-specific analysis
    if (overallStats.avgSoloKills && overallStats.avgSoloKills > 1.5) {
      strengths.push({
        category: 'combat',
        title: 'Lane kingdom',
        description: `${overallStats.avgSoloKills.toFixed(1)} solo kills/game, tu gagnes tes 1v1 et tu connais les power spikes de ton champ. Tu punish les erreurs de position.`,
        value: overallStats.avgSoloKills,
        importance: 'high',
      });
    }

    if (overallStats.firstBloodRate > 25) {
      strengths.push({
        category: 'aggression',
        title: 'First blood mid',
        description: `${overallStats.firstBloodRate.toFixed(0)}% first blood, tu abuse les level 2/3 spikes ou tu aide ton jungler pour l'invade. Early lead = snowball.`,
        value: overallStats.firstBloodRate,
        importance: 'medium',
      });
    }

    if (overallStats.avgCSPerMin < 7.5) {
      weaknesses.push({
        category: 'farming',
        title: 'CS de mid insuffisant',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min, tu roam trop sans push ou tu rates trop de last-hit. Push la wave PUIS roam, sinon tu perds XP et gold.`,
        value: overallStats.avgCSPerMin,
        importance: 'high',
      });
    }
  }

  if (mainRoleName === 'TOP') {
    // Top-specific analysis
    if (overallStats.avgSoloKills && overallStats.avgSoloKills > 1.5) {
      strengths.push({
        category: 'combat',
        title: 'Island 1v1 king',
        description: `${overallStats.avgSoloKills.toFixed(1)} solo kills/game en top. Tu connais les matchups et tu sais quand all-in. Ta wave management force les dives.`,
        value: overallStats.avgSoloKills,
        importance: 'high',
      });
    }

    if (overallStats.avgTurretPlatesTaken && overallStats.avgTurretPlatesTaken > 1.5) {
      strengths.push({
        category: 'objectives',
        title: 'Plate collector',
        description: `${overallStats.avgTurretPlatesTaken.toFixed(1)} plates/game, tu punis les backs adverses et tu convertis tes kills en objectifs.`,
        value: overallStats.avgTurretPlatesTaken,
        importance: 'medium',
      });
    }

    if (overallStats.avgKillParticipation < 45) {
      weaknesses.push({
        category: 'teamplay',
        title: 'Top island permanent',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% KP, tu splitpush H24 sans TP ou tu ne suis pas les fights. Garde ton TP pour les dragons, join les teamfights mid-game.`,
        value: overallStats.avgKillParticipation,
        importance: 'medium',
      });
    }
  }

  // ========== GENERAL INSIGHTS ==========

  // Solo kills analysis
  if (overallStats.avgSoloKills !== undefined) {
    if (overallStats.avgSoloKills < 0.5 && mainRoleName !== 'UTILITY') {
      weaknesses.push({
        category: 'combat',
        title: 'Pas de pression 1v1',
        description: `${overallStats.avgSoloKills.toFixed(1)} solo kill/game. Tu ne trade pas assez ou tu ne connais pas tes windows d'all-in. Apprends les power spikes de ton champion.`,
        value: overallStats.avgSoloKills,
        importance: 'medium',
      });
    }
  }

  // Skillshot analysis
  if (overallStats.avgSkillshotsDodged !== undefined && overallStats.avgSkillshotsHit !== undefined) {
    const dodgeRatio = overallStats.avgSkillshotsDodged / (overallStats.avgSkillshotsHit + 1);
    if (dodgeRatio > 1.5) {
      strengths.push({
        category: 'combat',
        title: 'Esquive de challenger',
        description: `Tu dodge ${overallStats.avgSkillshotsDodged.toFixed(0)} skillshots/game. Ton spacing et tes sidesteps sont propres, tu force les cooldowns adverses.`,
        value: overallStats.avgSkillshotsDodged,
        importance: 'medium',
      });
    } else if (dodgeRatio < 0.7 && overallStats.avgSkillshotsDodged < 20) {
      weaknesses.push({
        category: 'combat',
        title: 'Skillshot magnet',
        description: `Tu te prends tout. Arrête de move en ligne droite, side-step après chaque CS, anticipe les patterns ennemis (Lux bind après E, Blitz hook après W).`,
        value: overallStats.avgSkillshotsDodged,
        importance: 'medium',
      });
    }
  }

  // Control wards analysis
  if (overallStats.avgControlWardsPlaced !== undefined) {
    if (overallStats.avgControlWardsPlaced > 3) {
      strengths.push({
        category: 'vision',
        title: 'Pink ward addict',
        description: `${overallStats.avgControlWardsPlaced.toFixed(1)} control wards/game. Tu secure la vision pour ton équipe et tu deny les flanks ennemis.`,
        value: overallStats.avgControlWardsPlaced,
        importance: 'medium',
      });
    } else if (overallStats.avgControlWardsPlaced < 1.5 && mainRoleName !== 'BOTTOM') {
      weaknesses.push({
        category: 'vision',
        title: 'Zéro pink',
        description: `${overallStats.avgControlWardsPlaced.toFixed(1)} control wards/game. 75g c'est rien, buy un pink à chaque back. Met le dans un bush permanent (pixel brush, tribush).`,
        value: overallStats.avgControlWardsPlaced,
        importance: 'medium',
      });
    }
  }

  // Death timing analysis
  if (deathAnalysis.avgDeathsFirst15Min > 3) {
    weaknesses.push({
      category: 'survivability',
      title: 'Early game deaths',
      description: `${deathAnalysis.avgDeathsFirst15Min.toFixed(1)} morts avant 15min en moyenne. Tu te fais gank, tu force des trades perdants, ou tu overstay. Respect le fog of war.`,
      value: deathAnalysis.avgDeathsFirst15Min,
      importance: 'high',
    });
  }

  if (deathAnalysis.deathsInLostGames > deathAnalysis.deathsInWonGames * 1.8) {
    weaknesses.push({
      category: 'consistency',
      title: 'Tilt deaths',
      description: `${deathAnalysis.deathsInLostGames.toFixed(1)} morts dans les défaites vs ${deathAnalysis.deathsInWonGames.toFixed(1)} dans les wins. Tu int quand tu es behind. Accepte de farmer safe et wait les erreurs adverses.`,
      value: deathAnalysis.deathsInLostGames,
      importance: 'high',
    });
  }

  // Consistency check
  const winRateVariance = calculateConsistency(playerMatches);
  if (winRateVariance < 0.3) {
    strengths.push({
      category: 'consistency',
      title: 'Performance stable',
      description: 'Ta performance est régulière. Tu as une baseline solide et tu tiltes pas. C\'est la clé pour climb.',
      value: winRateVariance,
      importance: 'medium',
    });
  } else if (winRateVariance > 0.6) {
    weaknesses.push({
      category: 'consistency',
      title: 'Coinflip player',
      description: 'Un game tu carry, l\'autre tu int. Stick à 2-3 champs max, arrête de play tilté, et focus les fondamentaux même quand tu es fed.',
      value: winRateVariance,
      importance: 'high',
    });
  }

  // Early game gold analysis
  if (earlyGameAnalysis.avgLaneMinions10 !== undefined) {
    if (earlyGameAnalysis.avgLaneMinions10 > 80 && mainRoleName !== 'JUNGLE' && mainRoleName !== 'UTILITY') {
      strengths.push({
        category: 'farming',
        title: 'Early CS on point',
        description: `${earlyGameAnalysis.avgLaneMinions10.toFixed(0)} CS à 10min, tu last-hit proprement et tu perds pas de CS aux trades ou backs mal timés.`,
        value: earlyGameAnalysis.avgLaneMinions10,
        importance: 'high',
      });
    } else if (earlyGameAnalysis.avgLaneMinions10 < 60 && mainRoleName !== 'JUNGLE' && mainRoleName !== 'UTILITY') {
      weaknesses.push({
        category: 'farming',
        title: 'CS@10 trop bas',
        description: `${earlyGameAnalysis.avgLaneMinions10.toFixed(0)} CS à 10min (~107 possible). Tu rates des last-hit, tu back mal, ou tu te fais zone. Pratique en tool et focus 1 minion à la fois.`,
        value: earlyGameAnalysis.avgLaneMinions10,
        importance: 'high',
      });
    }
  }

  return { strengths, weaknesses };
}

// Analyze death patterns from match data
function analyzeDeathPatterns(playerMatches: PlayerMatch[]): {
  avgDeathsFirst15Min: number;
  deathsInWonGames: number;
  deathsInLostGames: number;
} {
  let totalDeathsFirst15 = 0;
  let deathsWins = 0;
  let deathsLosses = 0;
  let winsCount = 0;
  let lossesCount = 0;

  for (const pm of playerMatches) {
    const p = pm.participant;

    // Estimate early deaths based on total deaths and game duration
    // Games < 20min: assume most deaths are "early"
    // Games > 30min: assume ~40% of deaths are early
    const gameDurationMin = pm.gameDuration / 60;
    const earlyDeathRatio = gameDurationMin < 20 ? 0.8 : gameDurationMin < 30 ? 0.5 : 0.35;
    totalDeathsFirst15 += p.deaths * earlyDeathRatio;

    if (p.win) {
      deathsWins += p.deaths;
      winsCount++;
    } else {
      deathsLosses += p.deaths;
      lossesCount++;
    }
  }

  return {
    avgDeathsFirst15Min: totalDeathsFirst15 / playerMatches.length,
    deathsInWonGames: winsCount > 0 ? deathsWins / winsCount : 0,
    deathsInLostGames: lossesCount > 0 ? deathsLosses / lossesCount : 0,
  };
}

// Analyze early game performance
function analyzeEarlyGame(playerMatches: PlayerMatch[], role: string): {
  avgLaneMinions10?: number;
  avgEarlyGoldAdv?: number;
} {
  let totalLaneMinions = 0;
  let laneMinionsCount = 0;
  let totalGoldAdv = 0;
  let goldAdvCount = 0;

  for (const pm of playerMatches) {
    const challenges = pm.participant.challenges;
    if (challenges) {
      if (challenges.laneMinionsFirst10Minutes !== undefined) {
        totalLaneMinions += challenges.laneMinionsFirst10Minutes;
        laneMinionsCount++;
      }
      if (challenges.earlyLaningPhaseGoldExpAdvantage !== undefined) {
        totalGoldAdv += challenges.earlyLaningPhaseGoldExpAdvantage;
        goldAdvCount++;
      }
    }
  }

  return {
    avgLaneMinions10: laneMinionsCount > 0 ? totalLaneMinions / laneMinionsCount : undefined,
    avgEarlyGoldAdv: goldAdvCount > 0 ? totalGoldAdv / goldAdvCount : undefined,
  };
}

function generateImprovements(
  weaknesses: AnalysisInsight[],
  roleStats: Record<string, RoleStats>,
  overallStats: OverallStats
): ImprovementSuggestion[] {
  const improvements: ImprovementSuggestion[] = [];

  // Get main role for role-specific tips
  const mainRole = Object.entries(roleStats).sort((a, b) => b[1].games - a[1].games)[0];
  const mainRoleName = mainRole?.[0] || 'MIDDLE';

  for (const weakness of weaknesses) {
    let suggestion: ImprovementSuggestion | null = null;

    switch (weakness.category) {
      case 'combat':
        if (weakness.title.includes('solo kill') || weakness.title.includes('1v1')) {
          suggestion = {
            priority: 1,
            category: 'combat',
            title: 'Apprends à gagner tes trades',
            description: 'La pression 1v1 te permet de deny CS, roam, et créer des leads.',
            currentValue: overallStats.avgSoloKills || 0,
            targetValue: 1.5,
            tips: [
              'Apprends les power spikes de ton champ: Level 2 (2 spells), Level 3, Level 6, items terminés',
              'Trade quand l\'ennemi last-hit (il est en animation)',
              'Track les cooldowns ennemis et all-in quand ils n\'ont plus de spells',
              'Utilise les bushes pour drop l\'aggro des minions pendant les trades',
            ],
          };
        } else if (weakness.title.includes('damage')) {
          suggestion = {
            priority: 1,
            category: 'combat',
            title: 'Output plus de damage en fight',
            description: 'Ton damage share est trop bas, tu ne contribues pas assez aux fights.',
            currentValue: overallStats.avgDamageShare,
            targetValue: mainRoleName === 'BOTTOM' ? 28 : 22,
            tips: [
              'En ADC: auto le target le plus proche safe, pas besoin de focus le carry',
              'Arrive aux fights AVANT qu\'ils commencent, pas après',
              'Utilise tes spells de poke avant que le fight commence',
              'Ne garde pas tes ult trop longtemps, un ult utilisé > un ult gardé "au cas où"',
            ],
          };
        } else {
          suggestion = {
            priority: 1,
            category: 'combat',
            title: 'Améliore tes mechanics',
            description: 'Tu prends trop de skillshots et tu ne connais pas tes limites.',
            currentValue: overallStats.avgKDA,
            targetValue: 3.0,
            tips: [
              'Side-step après chaque auto/CS - ne reste jamais statique',
              'Anticipe les patterns: Lux E puis Q, Thresh W puis Q, Blitz W puis Q',
              'En lane, reste derrière tes minions pour block les skillshots',
              'Pratique le kiting en Practice Tool contre des dummies',
            ],
          };
        }
        break;

      case 'farming':
        suggestion = {
          priority: 1,
          category: 'farming',
          title: 'Master le last-hitting',
          description: '15 CS = 1 kill en gold. +1 CS/min = 300g de plus à 20min.',
          currentValue: overallStats.avgCSPerMin,
          targetValue: mainRoleName === 'JUNGLE' ? 5.5 : 8.0,
          tips: mainRoleName === 'JUNGLE' ? [
            'Full clear tes camps, ne laisse pas de mini monsters',
            'Kite les camps pour réduire les dégâts pris',
            'Prends les waves quand tes laners back (avec leur accord)',
            'Après un gank réussi, push la wave avec ton laner pour le deny',
          ] : [
            'Last-hit sous tour: Melee = 2 tower hits + 1 auto, Caster = 1 auto + tower + 1 auto',
            'Pratique 10min/jour en Practice Tool: objectif 100 CS à 10min',
            'Ne trade PAS si tu vas rater un canon (20g + XP important)',
            'Après 15min, catch les waves sides - 1 wave = 125g',
          ],
        };
        break;

      case 'vision':
        suggestion = {
          priority: 2,
          category: 'vision',
          title: 'Contrôle la vision',
          description: 'La vision = l\'information. L\'information = des décisions smart.',
          currentValue: overallStats.avgVisionPerMin,
          targetValue: mainRoleName === 'UTILITY' ? 2.0 : 1.0,
          tips: mainRoleName === 'UTILITY' ? [
            'Ward la river level 1 pour spot l\'invade/le path du jungler',
            'Après le push level 3, ward le tribush ou derrière le dragon pit',
            'Avant dragon/baron: sweep + ward les flanks 1min AVANT le spawn',
            'Place ton pink dans un bush permanent (pixel brush mid, tribush bot)',
          ] : mainRoleName === 'JUNGLE' ? [
            'Pink la jungle ennemie côté où tu veux jouer',
            'Ward le camp adverse que tu veux voler 30s avant respawn',
            'Sweep baron/dragon 1min avant spawn',
            'Place des wards deep quand tu as prio sur la map',
          ] : [
            'Buy un pink CHAQUE back - 75g peut save ta vie',
            'Place ton pink dans le bush river ou tribush',
            'Utilise ton trinket sur CD - une ward posée > une ward gardée',
            'Si tu push, ward les 2 entrées de jungle (river + tribush/raptors)',
          ],
        };
        break;

      case 'survivability':
        suggestion = {
          priority: 1,
          category: 'survivability',
          title: 'Arrête de mourir pour rien',
          description: 'Chaque mort = 30s+ hors de la map = CS perdu, XP perdu, pression perdue.',
          currentValue: overallStats.avgDeaths,
          targetValue: 4,
          tips: [
            'Regarde ta minimap toutes les 3-5 secondes. Si tu vois pas le jungler, joue safe.',
            'Ne chase jamais dans le fog of war - c\'est comme ça que tu te fais turn',
            'Quand t\'es behind, accepte de perdre des CS pour pas mourir',
            'Si tu viens de kill ton laner, BACK. Ne reste pas low HP pour farm 2 minions.',
          ],
        };
        break;

      case 'teamplay':
        if (mainRoleName === 'TOP') {
          suggestion = {
            priority: 2,
            category: 'teamplay',
            title: 'Impact le reste de la map',
            description: 'Le top c\'est pas une île. Ton TP et tes roams peuvent win le game.',
            currentValue: overallStats.avgKillParticipation,
            targetValue: 55,
            tips: [
              'Garde ton TP pour les dragons - un 5v4 bot = free drake + kills',
              'Si tu gagnes hard ta lane, push et roam mid',
              'Ping quand tu TP pour que ton équipe engage',
              'Après 15min, groupe avec ton équipe pour les objectifs',
            ],
          };
        } else if (mainRoleName === 'JUNGLE') {
          suggestion = {
            priority: 1,
            category: 'teamplay',
            title: 'Gank plus efficacement',
            description: 'Ta présence sur la map définit le tempo du game.',
            currentValue: overallStats.avgKillParticipation,
            targetValue: 65,
            tips: [
              'Gank une lane qui a setup la wave (slow push vers leur tour)',
              'Gank après que l\'ennemi utilise son escape (Ezreal E, Ahri R)',
              'Contre-gank = free double kill. Track le jungler ennemi et sois là.',
              'Dive les ennemis low HP sous tour avec tes laners - la tour te switch',
            ],
          };
        } else {
          suggestion = {
            priority: 2,
            category: 'teamplay',
            title: 'Participe plus aux fights',
            description: 'Les games se win en équipe, pas en solo.',
            currentValue: overallStats.avgKillParticipation,
            targetValue: 60,
            tips: [
              'Watch ta minimap et move vers les fights AVANT qu\'ils commencent',
              'Ping "On my way" quand tu roam pour que ton équipe sache',
              'Ne farm pas bot quand ton équipe fight pour Baron',
              'En mid-game, groupe avec ton équipe plutôt que split seul',
            ],
          };
        }
        break;

      case 'consistency':
        suggestion = {
          priority: 2,
          category: 'consistency',
          title: 'Stabilise ton niveau de jeu',
          description: 'Un joueur consistent climb. Un joueur coinflip stagne.',
          currentValue: weakness.value,
          targetValue: 0.3,
          tips: [
            'One-trick ou joue max 3 champions. Tu ne peux pas être bon sur 10 champs.',
            'Arrête de jouer après 2 défaites de suite. Le tilt = mauvaises décisions.',
            'Même fed, respecte tes fondamentaux: ward, track, farm.',
            'Review tes replays: chaque mort = une erreur. Trouve laquelle.',
          ],
        };
        break;

      case 'objectives':
        suggestion = {
          priority: 2,
          category: 'objectives',
          title: 'Priorise les objectifs',
          description: 'Dragons, heralds, barons win les games. Pas les kills.',
          currentValue: overallStats.avgDragonTakedowns || 0,
          targetValue: 2.5,
          tips: [
            'Setup vision 1min avant spawn (pink + sweep)',
            'Push les waves bot/mid avant de start dragon',
            'Herald = 2-3 plates = 320-480g. Use le dans une lane avec plates.',
            'Après un ace ou 2 kills, toujours take un objectif (pas recall)',
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
