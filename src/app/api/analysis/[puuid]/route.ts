import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch, QUEUE_IDS } from '@/lib/cache';
import { redis, cacheKeys, CACHE_TTL } from '@/lib/redis';
import { db } from '@/lib/db';
import { championBenchmarks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError, getMatchTimeline } from '@/lib/riot-api';
import type { Match, Participant, Team } from '@/types/riot';
import { analyzeSingleTimeline, aggregateTimelineStats } from '@/lib/timeline-analysis';
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
  type TimelineAnalysis,
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

  // Timeline analysis (fetch timelines for recent games)
  let timelineAnalysis: TimelineAnalysis | undefined;
  try {
    timelineAnalysis = await calculateTimelineAnalysis(puuid, playerMatches.slice(0, 20), region as RegionKey);
  } catch (e) {
    console.warn('Failed to calculate timeline analysis:', e);
  }

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
    timelineAnalysis,
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
        title: 'Oppressive jungle presence',
        description: `With ${overallStats.avgKillParticipation.toFixed(0)}% KP, you're involved in every play. You understand when to gank vs farm and your pathing creates pressure.`,
        value: overallStats.avgKillParticipation,
        importance: 'high',
      });
    } else if (overallStats.avgKillParticipation < 50) {
      weaknesses.push({
        category: 'teamplay',
        title: 'Ghost jungler',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% KP means you're farming while your laners get dove. Track enemy timers and gank when your lanes have wave setup.`,
        value: overallStats.avgKillParticipation,
        importance: 'high',
      });
    }

    if (overallStats.avgDragonTakedowns && overallStats.avgDragonTakedowns > 2) {
      strengths.push({
        category: 'objectives',
        title: 'Dragon Soul focused',
        description: `${overallStats.avgDragonTakedowns.toFixed(1)} dragons/game average. You prioritize objectives well and setup vision before spawns.`,
        value: overallStats.avgDragonTakedowns,
        importance: 'high',
      });
    }

    if (overallStats.avgVisionPerMin < 0.8) {
      weaknesses.push({
        category: 'vision',
        title: 'Blind jungler',
        description: `${overallStats.avgVisionPerMin.toFixed(2)} vision/min is not enough. Place pinks in enemy jungle, sweep objectives 1min before spawn.`,
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
        title: 'Pro-level vision',
        description: `${overallStats.avgVisionPerMin.toFixed(2)} vision/min - your vision controls the map. You ward flanks in teamfights and track the enemy jungler.`,
        value: overallStats.avgVisionPerMin,
        importance: 'high',
      });
    } else if (overallStats.avgVisionPerMin < 1.5) {
      weaknesses.push({
        category: 'vision',
        title: 'Wardless support',
        description: `${overallStats.avgVisionPerMin.toFixed(2)} vision/min for support is critical. Use your support item + pinks. Ward river level 1, tribush after push.`,
        value: overallStats.avgVisionPerMin,
        importance: 'high',
      });
    }

    if (overallStats.avgKillParticipation > 70) {
      strengths.push({
        category: 'teamplay',
        title: 'Omnipresent support',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% KP - you're everywhere. Your mid roams are well-timed and you follow up on your jungler's engages.`,
        value: overallStats.avgKillParticipation,
        importance: 'high',
      });
    }

    if (overallStats.avgDeaths > 5) {
      weaknesses.push({
        category: 'survivability',
        title: 'Kamikaze support',
        description: `${overallStats.avgDeaths.toFixed(1)} deaths/game - you engage without backup or facecheck without vision. Your death = your ADC is alone.`,
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
        title: 'Clean ADC farming',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min - you last-hit well and catch side waves. You hit your power spikes on time.`,
        value: overallStats.avgCSPerMin,
        importance: 'high',
      });
    } else if (overallStats.avgCSPerMin < 7) {
      weaknesses.push({
        category: 'farming',
        title: 'Low ADC CS',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min is 1.5 items behind at 25min. Practice last-hitting under tower (melee: 2 tower + 1 auto, caster: 1 auto + tower + 1 auto).`,
        value: overallStats.avgCSPerMin,
        importance: 'high',
      });
    }

    if (overallStats.avgDamageShare > 28) {
      strengths.push({
        category: 'combat',
        title: 'Carry damage dealer',
        description: `${overallStats.avgDamageShare.toFixed(0)}% of your team's damage. You DPS in teamfights without getting one-shot, your kiting is clean.`,
        value: overallStats.avgDamageShare,
        importance: 'high',
      });
    } else if (overallStats.avgDamageShare < 22) {
      weaknesses.push({
        category: 'combat',
        title: 'Low damage ADC',
        description: `${overallStats.avgDamageShare.toFixed(0)}% damage share for ADC is too low. You position too far or arrive late to fights. Stay max range and auto the closest target.`,
        value: overallStats.avgDamageShare,
        importance: 'high',
      });
    }

    if (deathAnalysis.avgDeathsFirst15Min > 2) {
      weaknesses.push({
        category: 'survivability',
        title: 'Suicidal laning phase',
        description: `${deathAnalysis.avgDeathsFirst15Min.toFixed(1)} deaths before 15min. You're getting ganked or taking losing trades. Freeze near your tower when behind, ward the tribush.`,
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
        description: `${overallStats.avgSoloKills.toFixed(1)} solo kills/game - you win your 1v1s and know your champion's power spikes. You punish positioning mistakes.`,
        value: overallStats.avgSoloKills,
        importance: 'high',
      });
    }

    if (overallStats.firstBloodRate > 25) {
      strengths.push({
        category: 'aggression',
        title: 'First blood threat',
        description: `${overallStats.firstBloodRate.toFixed(0)}% first blood rate - you abuse level 2/3 spikes or help your jungler invade. Early lead = snowball.`,
        value: overallStats.firstBloodRate,
        importance: 'medium',
      });
    }

    if (overallStats.avgCSPerMin < 7.5) {
      weaknesses.push({
        category: 'farming',
        title: 'Low mid CS',
        description: `${overallStats.avgCSPerMin.toFixed(1)} CS/min - you roam without pushing or miss too many last-hits. Push wave THEN roam, otherwise you lose XP and gold.`,
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
        description: `${overallStats.avgSoloKills.toFixed(1)} solo kills/game in top. You know matchups and when to all-in. Your wave management forces favorable dives.`,
        value: overallStats.avgSoloKills,
        importance: 'high',
      });
    }

    if (overallStats.avgTurretPlatesTaken && overallStats.avgTurretPlatesTaken > 1.5) {
      strengths.push({
        category: 'objectives',
        title: 'Plate collector',
        description: `${overallStats.avgTurretPlatesTaken.toFixed(1)} plates/game - you punish enemy backs and convert kills into objectives.`,
        value: overallStats.avgTurretPlatesTaken,
        importance: 'medium',
      });
    }

    if (overallStats.avgKillParticipation < 45) {
      weaknesses.push({
        category: 'teamplay',
        title: 'Permanent top island',
        description: `${overallStats.avgKillParticipation.toFixed(0)}% KP - you splitpush 24/7 without TP or don't join fights. Save TP for dragons, join teamfights mid-game.`,
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
        title: 'No 1v1 pressure',
        description: `${overallStats.avgSoloKills.toFixed(1)} solo kills/game. You don't trade enough or don't know your all-in windows. Learn your champion's power spikes.`,
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
        title: 'Challenger-level dodging',
        description: `You dodge ${overallStats.avgSkillshotsDodged.toFixed(0)} skillshots/game. Your spacing and sidesteps are clean, you force enemy cooldowns.`,
        value: overallStats.avgSkillshotsDodged,
        importance: 'medium',
      });
    } else if (dodgeRatio < 0.7 && overallStats.avgSkillshotsDodged < 20) {
      weaknesses.push({
        category: 'combat',
        title: 'Skillshot magnet',
        description: `You eat every skillshot. Stop moving in straight lines, sidestep after each CS, anticipate enemy patterns (Lux Q after E, Blitz Q after W).`,
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
        description: `${overallStats.avgControlWardsPlaced.toFixed(1)} control wards/game. You secure vision for your team and deny enemy flanks.`,
        value: overallStats.avgControlWardsPlaced,
        importance: 'medium',
      });
    } else if (overallStats.avgControlWardsPlaced < 1.5 && mainRoleName !== 'BOTTOM') {
      weaknesses.push({
        category: 'vision',
        title: 'Zero pinks',
        description: `${overallStats.avgControlWardsPlaced.toFixed(1)} control wards/game. 75g is nothing - buy a pink every back. Place it in a permanent bush (pixel brush, tribush).`,
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
      description: `${deathAnalysis.avgDeathsFirst15Min.toFixed(1)} deaths before 15min on average. You're getting ganked, forcing losing trades, or overstaying. Respect the fog of war.`,
      value: deathAnalysis.avgDeathsFirst15Min,
      importance: 'high',
    });
  }

  if (deathAnalysis.deathsInLostGames > deathAnalysis.deathsInWonGames * 1.8) {
    weaknesses.push({
      category: 'consistency',
      title: 'Tilt deaths',
      description: `${deathAnalysis.deathsInLostGames.toFixed(1)} deaths in losses vs ${deathAnalysis.deathsInWonGames.toFixed(1)} in wins. You int when behind. Accept farming safe and wait for enemy mistakes.`,
      value: deathAnalysis.deathsInLostGames,
      importance: 'high',
    });
  }

  // Consistency check
  const winRateVariance = calculateConsistency(playerMatches);
  if (winRateVariance < 0.3) {
    strengths.push({
      category: 'consistency',
      title: 'Stable performance',
      description: 'Your performance is consistent. You have a solid baseline and don\'t tilt. This is key to climbing.',
      value: winRateVariance,
      importance: 'medium',
    });
  } else if (winRateVariance > 0.6) {
    weaknesses.push({
      category: 'consistency',
      title: 'Coinflip player',
      description: 'One game you carry, next game you int. Stick to 2-3 champs max, stop playing tilted, and focus fundamentals even when fed.',
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
        description: `${earlyGameAnalysis.avgLaneMinions10.toFixed(0)} CS at 10min - you last-hit cleanly and don't lose CS to trades or bad backs.`,
        value: earlyGameAnalysis.avgLaneMinions10,
        importance: 'high',
      });
    } else if (earlyGameAnalysis.avgLaneMinions10 < 60 && mainRoleName !== 'JUNGLE' && mainRoleName !== 'UTILITY') {
      weaknesses.push({
        category: 'farming',
        title: 'Low CS@10',
        description: `${earlyGameAnalysis.avgLaneMinions10.toFixed(0)} CS at 10min (~107 possible). You're missing last-hits, backing badly, or getting zoned. Practice in tool and focus one minion at a time.`,
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
            title: 'Learn to win trades',
            description: '1v1 pressure lets you deny CS, roam, and create leads.',
            currentValue: overallStats.avgSoloKills || 0,
            targetValue: 1.5,
            tips: [
              'Learn your power spikes: Level 2 (2 spells), Level 3, Level 6, completed items',
              'Trade when enemy is last-hitting (they\'re in animation)',
              'Track enemy cooldowns and all-in when they have no spells',
              'Use bushes to drop minion aggro during trades',
            ],
          };
        } else if (weakness.title.includes('damage')) {
          suggestion = {
            priority: 1,
            category: 'combat',
            title: 'Output more damage in fights',
            description: 'Your damage share is too low, you\'re not contributing enough to fights.',
            currentValue: overallStats.avgDamageShare,
            targetValue: mainRoleName === 'BOTTOM' ? 28 : 22,
            tips: [
              'As ADC: auto the closest safe target, no need to focus the carry',
              'Arrive to fights BEFORE they start, not after',
              'Use poke spells before the fight starts',
              'Don\'t hold ult too long - a used ult > an ult saved "just in case"',
            ],
          };
        } else {
          suggestion = {
            priority: 1,
            category: 'combat',
            title: 'Improve your mechanics',
            description: 'You eat too many skillshots and don\'t know your limits.',
            currentValue: overallStats.avgKDA,
            targetValue: 3.0,
            tips: [
              'Sidestep after every auto/CS - never stand still',
              'Anticipate patterns: Lux E then Q, Thresh W then Q, Blitz W then Q',
              'In lane, stay behind your minions to block skillshots',
              'Practice kiting in Practice Tool against dummies',
            ],
          };
        }
        break;

      case 'farming':
        suggestion = {
          priority: 1,
          category: 'farming',
          title: 'Master last-hitting',
          description: '15 CS = 1 kill in gold. +1 CS/min = 300g more at 20min.',
          currentValue: overallStats.avgCSPerMin,
          targetValue: mainRoleName === 'JUNGLE' ? 5.5 : 8.0,
          tips: mainRoleName === 'JUNGLE' ? [
            'Full clear your camps, don\'t leave small monsters',
            'Kite camps to reduce damage taken',
            'Take waves when your laners back (with their permission)',
            'After a successful gank, push the wave with your laner for deny',
          ] : [
            'Last-hit under tower: Melee = 2 tower hits + 1 auto, Caster = 1 auto + tower + 1 auto',
            'Practice 10min/day in Practice Tool: goal 100 CS at 10min',
            'Don\'t trade if you\'ll miss a cannon (20g + important XP)',
            'After 15min, catch side waves - 1 wave = 125g',
          ],
        };
        break;

      case 'vision':
        suggestion = {
          priority: 2,
          category: 'vision',
          title: 'Control vision',
          description: 'Vision = information. Information = smart decisions.',
          currentValue: overallStats.avgVisionPerMin,
          targetValue: mainRoleName === 'UTILITY' ? 2.0 : 1.0,
          tips: mainRoleName === 'UTILITY' ? [
            'Ward river level 1 to spot invade/jungler path',
            'After level 3 push, ward tribush or behind dragon pit',
            'Before dragon/baron: sweep + ward flanks 1min BEFORE spawn',
            'Place your pink in a permanent bush (pixel brush mid, tribush bot)',
          ] : mainRoleName === 'JUNGLE' ? [
            'Pink enemy jungle on the side you want to play',
            'Ward the enemy camp you want to steal 30s before respawn',
            'Sweep baron/dragon 1min before spawn',
            'Place deep wards when you have map priority',
          ] : [
            'Buy a pink EVERY back - 75g can save your life',
            'Place your pink in river bush or tribush',
            'Use your trinket on CD - a placed ward > a saved ward',
            'If you push, ward both jungle entrances (river + tribush/raptors)',
          ],
        };
        break;

      case 'survivability':
        suggestion = {
          priority: 1,
          category: 'survivability',
          title: 'Stop dying for nothing',
          description: 'Every death = 30s+ off the map = lost CS, XP, and pressure.',
          currentValue: overallStats.avgDeaths,
          targetValue: 4,
          tips: [
            'Check minimap every 3-5 seconds. If you don\'t see jungler, play safe.',
            'Never chase into fog of war - that\'s how you get turned on',
            'When behind, accept losing CS to avoid dying',
            'After killing your laner, BACK. Don\'t stay low HP for 2 minions.',
          ],
        };
        break;

      case 'teamplay':
        if (mainRoleName === 'TOP') {
          suggestion = {
            priority: 2,
            category: 'teamplay',
            title: 'Impact the rest of the map',
            description: 'Top isn\'t an island. Your TP and roams can win the game.',
            currentValue: overallStats.avgKillParticipation,
            targetValue: 55,
            tips: [
              'Save TP for dragons - 5v4 bot = free drake + kills',
              'If you\'re smashing lane, push and roam mid',
              'Ping when you TP so your team engages',
              'After 15min, group with team for objectives',
            ],
          };
        } else if (mainRoleName === 'JUNGLE') {
          suggestion = {
            priority: 1,
            category: 'teamplay',
            title: 'Gank more effectively',
            description: 'Your map presence defines the game\'s tempo.',
            currentValue: overallStats.avgKillParticipation,
            targetValue: 65,
            tips: [
              'Gank a lane that has wave setup (slow push to their tower)',
              'Gank after enemy uses their escape (Ezreal E, Ahri R)',
              'Counter-gank = free double kill. Track enemy jungler and be there.',
              'Dive low HP enemies with your laners - tower will switch to you',
            ],
          };
        } else {
          suggestion = {
            priority: 2,
            category: 'teamplay',
            title: 'Participate more in fights',
            description: 'Games are won as a team, not solo.',
            currentValue: overallStats.avgKillParticipation,
            targetValue: 60,
            tips: [
              'Watch minimap and move to fights BEFORE they start',
              'Ping "On my way" when you roam so team knows',
              'Don\'t farm bot when your team is fighting for Baron',
              'In mid-game, group with team rather than split alone',
            ],
          };
        }
        break;

      case 'consistency':
        suggestion = {
          priority: 2,
          category: 'consistency',
          title: 'Stabilize your gameplay',
          description: 'Consistent players climb. Coinflip players stay stuck.',
          currentValue: weakness.value,
          targetValue: 0.3,
          tips: [
            'One-trick or play max 3 champions. You can\'t be good on 10 champs.',
            'Stop playing after 2 losses in a row. Tilt = bad decisions.',
            'Even when fed, respect fundamentals: ward, track, farm.',
            'Review replays: every death = a mistake. Find which one.',
          ],
        };
        break;

      case 'objectives':
        suggestion = {
          priority: 2,
          category: 'objectives',
          title: 'Prioritize objectives',
          description: 'Dragons, heralds, barons win games. Not kills.',
          currentValue: overallStats.avgDragonTakedowns || 0,
          targetValue: 2.5,
          tips: [
            'Setup vision 1min before spawn (pink + sweep)',
            'Push bot/mid waves before starting dragon',
            'Herald = 2-3 plates = 320-480g. Use it in a lane with plates.',
            'After an ace or 2 kills, always take an objective (don\'t recall)',
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

// Timeline analysis - fetch timelines ONE BY ONE and analyze to avoid memory issues
async function calculateTimelineAnalysis(
  puuid: string,
  playerMatches: PlayerMatch[],
  region: RegionKey
): Promise<TimelineAnalysis | undefined> {
  if (playerMatches.length === 0) return undefined;

  // Get the main role for this player
  const roleCounts: Record<string, number> = {};
  for (const pm of playerMatches) {
    const role = normalizeRole(pm.participant.teamPosition || pm.participant.individualPosition);
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }
  const mainRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'MIDDLE';

  // Process timelines one by one to avoid memory issues
  // We extract stats immediately and discard the frames
  type SingleGameStats = ReturnType<typeof analyzeSingleTimeline>;
  const gameStatsList: SingleGameStats[] = [];

  // Process up to 10 games one at a time
  const gamesToFetch = playerMatches.slice(0, 10);

  for (const pm of gamesToFetch) {
    try {
      // Fetch single timeline
      const timeline = await getMatchTimeline(pm.match.metadata.matchId, region);

      // Find participant ID for this player
      const participantMapping = timeline.info.participants.find(p => p.puuid === puuid);
      if (!participantMapping) continue;

      const participantId = participantMapping.participantId;

      // Find lane opponent (same role, opposite team)
      const playerRole = normalizeRole(pm.participant.teamPosition || pm.participant.individualPosition);
      let opponentId = participantId <= 5 ? participantId + 5 : participantId - 5; // Default to mirror

      // Try to find actual lane opponent by role
      for (const p of pm.allParticipants) {
        if (p.teamId !== pm.participant.teamId) {
          const oppRole = normalizeRole(p.teamPosition || p.individualPosition);
          if (oppRole === playerRole) {
            const oppMapping = timeline.info.participants.find(tp => tp.puuid === p.puuid);
            if (oppMapping) {
              opponentId = oppMapping.participantId;
              break;
            }
          }
        }
      }

      // Extract stats immediately from this timeline (doesn't store frames)
      const stats = analyzeSingleTimeline(
        pm.match.metadata.matchId,
        timeline.info.frames,
        participantId,
        opponentId,
        pm.participant.win,
        pm.gameDuration
      );

      gameStatsList.push(stats);
      // Timeline frames are now garbage-collected

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.warn(`Failed to fetch timeline for match ${pm.match.metadata.matchId}:`, e);
    }
  }

  if (gameStatsList.length === 0) {
    return undefined;
  }

  // Aggregate all the lightweight stats into final analysis
  return aggregateTimelineStats(gameStatsList, mainRole);
}
