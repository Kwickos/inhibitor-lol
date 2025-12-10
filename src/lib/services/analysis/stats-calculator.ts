import type { OverallStats, RoleStats, BenchmarkComparison } from '@/types/analysis';
import { ROLE_BENCHMARKS, getRating, getPercentile } from '@/types/analysis';
import type { PlayerMatch } from './types';
import { normalizeRole } from './helpers';

/**
 * Calculate overall stats from player matches
 */
export function calculateOverallStats(playerMatches: PlayerMatch[]): OverallStats {
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

  // Challenge-based metrics
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

    if (p.doubleKills > 0 || p.tripleKills > 0 || p.quadraKills > 0 || p.pentaKills > 0) {
      multiKills++;
    }

    const teamKills = teamParticipants.reduce((sum, tp) => sum + tp.kills, 0);
    if (teamKills > 0) {
      totalKP += (p.kills + p.assists) / teamKills;
    }

    const teamDamage = teamParticipants.reduce(
      (sum, tp) => sum + tp.totalDamageDealtToChampions,
      0
    );
    if (teamDamage > 0) {
      totalDamageShare += p.totalDamageDealtToChampions / teamDamage;
    }

    const teamGold = teamParticipants.reduce((sum, tp) => sum + tp.goldEarned, 0);
    if (teamGold > 0) {
      totalGoldShare += p.goldEarned / teamGold;
    }

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

    totalWardsKilled += p.wardsKilled;

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

  const avgDuration = totalDuration / count / 60;

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

/**
 * Calculate stats per role
 */
export function calculateRoleStats(playerMatches: PlayerMatch[]): Record<string, RoleStats> {
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
        benchmark: 400,
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

/**
 * Empty stats object
 */
export function getEmptyStats(): OverallStats {
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
