import type { Participant, Team } from '@/types/riot';

// Champion benchmark data from high elo
export interface ChampionBenchmark {
  championId: number;
  championName: string;
  role: string;
  tier: string;
  gamesAnalyzed: number;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  avgKda: number | null;
  winRate: number | null;
  avgCsPerMin: number | null;
  avgGoldPerMin: number | null;
  avgDamagePerMin: number | null;
  avgDamageShare: number | null;
  avgVisionScorePerMin: number | null;
  avgWardsPlaced: number | null;
  avgControlWardsPlaced: number | null;
  avgKillParticipation: number | null;
  avgSoloKills: number | null;
}

export interface GameScore {
  overall: number;
  combat: number;
  farming: number;
  vision: number;
  objectives: number;
  grade: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
  insights: string[];
  improvements: string[];
}

// Full score result for DB storage (same as GameScore)
export type GameScoreFull = GameScore;

/**
 * Calculate game score for a player
 * Can work with or without team data (allParticipants)
 */
export function calculateGameScore(
  participant: Participant,
  allParticipants: Participant[] | undefined,
  gameDuration: number,
  isWin: boolean,
  teamObjectives?: Team,
  benchmark?: ChampionBenchmark
): GameScore {
  const minutes = Math.max(gameDuration / 60, 1); // Minimum 1 minute to avoid division by zero
  const hasTeamData = allParticipants && allParticipants.length > 0;
  const teammates = hasTeamData ? allParticipants.filter(p => p.teamId === participant.teamId) : [participant];
  const enemies = hasTeamData ? allParticipants.filter(p => p.teamId !== participant.teamId) : [];
  const position = participant.teamPosition || participant.individualPosition || '';

  // Role detection
  const isSupport = position === 'UTILITY';
  const isJungler = position === 'JUNGLE';
  const isADC = position === 'BOTTOM';
  const isMid = position === 'MIDDLE';
  const isTop = position === 'TOP';

  // Find lane opponent (same position on enemy team)
  const opponent = enemies.find(e =>
    (e.teamPosition || e.individualPosition) === position
  );

  // ===== TEAM COMPARISONS =====
  const teamTotalKills = teammates.reduce((sum, p) => sum + p.kills, 0);
  const teamTotalDamage = teammates.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
  const teamTotalDamageTaken = teammates.reduce((sum, p) => sum + p.totalDamageTaken, 0);
  const teamTotalGold = teammates.reduce((sum, p) => sum + p.goldEarned, 0);

  // Player's share of team stats (%)
  // When we don't have team data, use reasonable defaults (20% = average for 5 players)
  const killParticipation = hasTeamData && teamTotalKills > 0
    ? ((participant.kills + participant.assists) / teamTotalKills) * 100
    : 50; // Assume average KP when no team data
  const damageShareTeam = hasTeamData && teamTotalDamage > 0
    ? (participant.totalDamageDealtToChampions / teamTotalDamage) * 100
    : 20; // Assume average damage share
  const damageTakenShare = hasTeamData && teamTotalDamageTaken > 0
    ? (participant.totalDamageTaken / teamTotalDamageTaken) * 100
    : 20;
  const goldShare = hasTeamData && teamTotalGold > 0
    ? (participant.goldEarned / teamTotalGold) * 100
    : 20;

  // ===== VS OPPONENT COMPARISONS =====
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin = cs / minutes;
  const goldPerMin = participant.goldEarned / minutes;
  const visionPerMin = participant.visionScore / minutes;

  let goldDiff = 0;
  let csDiff = 0;

  if (opponent && hasTeamData) {
    const oppCs = opponent.totalMinionsKilled + opponent.neutralMinionsKilled;
    goldDiff = participant.goldEarned - opponent.goldEarned;
    csDiff = cs - oppCs;
  }

  // ===== HELPER: Compare vs benchmark =====
  const compareVsBenchmark = (playerValue: number, benchmarkValue: number | null | undefined, fallback: number): number => {
    const target = (benchmarkValue != null ? benchmarkValue : fallback);
    if (target === 0) return 35;
    const ratio = playerValue / target;

    if (ratio >= 1.3) return Math.min(100, 85 + (ratio - 1.3) * 50);
    if (ratio >= 1.0) return 70 + (ratio - 1.0) * 50;
    if (ratio >= 0.8) return 50 + (ratio - 0.8) * 100;
    if (ratio >= 0.5) return 20 + (ratio - 0.5) * 100;
    return Math.max(0, ratio * 40);
  };

  // ===== COMBAT SCORE (0-100) =====
  const kda = participant.deaths === 0
    ? (participant.kills + participant.assists) * 1.5
    : (participant.kills + participant.assists) / participant.deaths;

  const benchmarkKda = benchmark?.avgKda ? benchmark.avgKda / 100 : null;
  const kdaFallback = isSupport ? 4.0 : 3.0;
  const kdaScore = compareVsBenchmark(kda, benchmarkKda, kdaFallback);

  const benchmarkKp = benchmark?.avgKillParticipation || null;
  const kpFallback = isSupport || isJungler ? 65 : 50;
  const kpScore = compareVsBenchmark(killParticipation, benchmarkKp, kpFallback);

  const benchmarkDmgShare = benchmark?.avgDamageShare || null;
  const dmgFallback = isSupport ? 10 : isADC || isMid ? 25 : 18;
  const dmgScore = isSupport
    ? Math.min(100, 70 + damageShareTeam * 2)
    : compareVsBenchmark(damageShareTeam, benchmarkDmgShare, dmgFallback);

  const soloKillsBonus = Math.min(15, (participant.largestMultiKill || 0) * 3);
  const firstBloodBonus = (participant.firstBloodKill ? 8 : 0) + (participant.firstBloodAssist ? 4 : 0);
  const combatVsOppBonus = opponent ? Math.min(10, Math.max(-10, (participant.kills - opponent.kills) * 2)) : 0;

  const ccTimePerMin = (participant.timeCCingOthers || 0) / minutes;
  const assistRatio = teamTotalKills > 0 ? (participant.assists / teamTotalKills) * 100 : 0;
  const ccBonus = isSupport ? Math.min(15, ccTimePerMin * 2) : 0;
  const assistBonus = isSupport ? Math.min(10, (assistRatio / 50) * 10) : 0;
  const junglerGankBonus = isJungler ? Math.min(10, participant.assists * 1.5) : 0;

  const combatKdaWeight = isSupport ? 0.25 : 0.30;
  const combatKpWeight = isSupport ? 0.25 : 0.25;
  const combatDmgWeight = isSupport ? 0.05 : 0.25;
  const combatBonusWeight = isSupport ? 0.45 : 0.20;

  const combat = isSupport
    ? Math.min(100,
        kdaScore * combatKdaWeight +
        kpScore * combatKpWeight +
        dmgScore * combatDmgWeight +
        (ccBonus + assistBonus + firstBloodBonus) * combatBonusWeight
      )
    : Math.min(100,
        kdaScore * combatKdaWeight +
        kpScore * combatKpWeight +
        dmgScore * combatDmgWeight +
        (soloKillsBonus + firstBloodBonus + combatVsOppBonus + junglerGankBonus) * combatBonusWeight
      );

  // ===== FARMING SCORE (0-100) =====
  const jungleCamps = participant.neutralMinionsKilled || 0;
  const jungleCampsPerMin = jungleCamps / minutes;

  const benchmarkCsPerMin = benchmark?.avgCsPerMin ? benchmark.avgCsPerMin / 100 : null;
  const csFallback = isSupport ? 1.5 : isJungler ? 5.5 : isTop ? 7.5 : 8.5;
  const csScore = compareVsBenchmark(csPerMin, benchmarkCsPerMin, csFallback);

  const jungleCampsTarget = 5.0;
  const jungleCampsScore = isJungler ? Math.min(100, (jungleCampsPerMin / jungleCampsTarget) * 100) : 0;

  const benchmarkGoldPerMin = benchmark?.avgGoldPerMin || null;
  const goldFallback = isSupport ? 320 : isJungler ? 400 : 480;
  const goldScore = compareVsBenchmark(goldPerMin, benchmarkGoldPerMin, goldFallback);

  const csDiffBonus = (!isSupport && !isJungler && opponent)
    ? Math.min(15, Math.max(-15, csDiff / 10))
    : 0;
  const goldDiffBonus = opponent ? Math.min(15, Math.max(-15, goldDiff / 500)) : 0;

  const enemyJungler = enemies.find(e => (e.teamPosition || e.individualPosition) === 'JUNGLE');
  const jungleGoldDiff = (isJungler && enemyJungler)
    ? participant.goldEarned - enemyJungler.goldEarned
    : 0;
  const jungleDiffBonus = isJungler ? Math.min(10, Math.max(-10, jungleGoldDiff / 400)) : 0;

  const farming = isSupport
    ? Math.min(100, goldScore * 0.8 + (goldDiffBonus + 10) * 0.2)
    : isJungler
      ? Math.min(100, jungleCampsScore * 0.40 + goldScore * 0.35 + (jungleDiffBonus + 10) * 0.25)
      : Math.min(100, csScore * 0.45 + goldScore * 0.35 + (csDiffBonus + goldDiffBonus + 20) * 0.20);

  // ===== VISION SCORE (0-100) =====
  const benchmarkVisionPerMin = benchmark?.avgVisionScorePerMin ? benchmark.avgVisionScorePerMin / 100 : null;
  const visionFallback = isSupport ? 2.2 : isJungler ? 1.0 : 0.7;
  const visionScoreBase = compareVsBenchmark(visionPerMin, benchmarkVisionPerMin, visionFallback);

  const controlWardsBought = participant.visionWardsBoughtInGame || 0;
  const benchmarkControlWards = benchmark?.avgControlWardsPlaced ? benchmark.avgControlWardsPlaced / 100 : null;
  const controlWardFallback = isSupport ? 4 : 2;
  const controlWardBonus = Math.min(15, compareVsBenchmark(controlWardsBought, benchmarkControlWards, controlWardFallback) * 0.15);

  const wardsPlaced = participant.wardsPlaced || 0;
  const benchmarkWardsPlaced = benchmark?.avgWardsPlaced ? benchmark.avgWardsPlaced / 100 : null;
  const wardsPlacedFallback = isSupport ? 25 : isJungler ? 10 : 8;
  const wardsPlacedBonus = Math.min(10, compareVsBenchmark(wardsPlaced, benchmarkWardsPlaced, wardsPlacedFallback) * 0.10);

  const wardsKilled = participant.wardsKilled || 0;
  const wardsKilledBonus = Math.min(10, wardsKilled * 2);

  const visionDiff = opponent ? participant.visionScore - opponent.visionScore : 0;
  const visionDiffBonus = opponent ? Math.min(10, Math.max(-10, visionDiff / 5)) : 0;

  const vision = isSupport
    ? Math.min(100,
        visionScoreBase * 0.40 +
        controlWardBonus * 0.15 +
        wardsPlacedBonus * 0.20 +
        wardsKilledBonus * 0.15 +
        (visionDiffBonus + 10) * 0.10
      )
    : Math.min(100,
        visionScoreBase * 0.55 +
        controlWardBonus * 0.15 +
        wardsKilledBonus * 0.10 +
        (visionDiffBonus + 10) * 0.20
      );

  // ===== OBJECTIVES SCORE (0-100) =====
  let objectives = 15;

  if (teamObjectives) {
    const towers = teamObjectives.objectives.tower?.kills || 0;
    const dragons = teamObjectives.objectives.dragon?.kills || 0;
    const barons = teamObjectives.objectives.baron?.kills || 0;
    const heralds = teamObjectives.objectives.riftHerald?.kills || 0;
    const inhibs = teamObjectives.objectives.inhibitor?.kills || 0;
    const grubs = teamObjectives.objectives.horde?.kills || 0;

    objectives += towers * 2 + dragons * 4 + barons * 8 + heralds * 3 + inhibs * 4 + grubs * 1.5;
  }

  const personalDragons = participant.dragonKills || 0;
  const personalBarons = participant.baronKills || 0;
  const turretKills = participant.turretKills || 0;
  const turretDamage = participant.damageDealtToTurrets || 0;
  const objectiveDamage = participant.damageDealtToObjectives || 0;
  const epicSteals = participant.objectivesStolen || 0;

  const turretDmgTarget = isSupport ? 1000 : isJungler ? 2000 : 4000;
  const turretDmgBonus = Math.min(10, (turretDamage / turretDmgTarget) * 10);

  const objDmgBonus = isJungler
    ? Math.min(15, (objectiveDamage / 20000) * 15)
    : Math.min(8, (objectiveDamage / 15000) * 8);

  const personalObjBonus = personalDragons * 5 + personalBarons * 10 + turretKills * 3;
  const stealBonus = epicSteals * 15;
  const firstTowerBonus = (participant.firstTowerKill ? 5 : 0) + (participant.firstTowerAssist ? 3 : 0);

  objectives = Math.min(100, objectives + turretDmgBonus + objDmgBonus + personalObjBonus + stealBonus + firstTowerBonus);

  // ===== XP AND LEVEL ADVANTAGE =====
  let xpBonus = 0;
  if (opponent) {
    const levelDiff = participant.champLevel - opponent.champLevel;
    xpBonus = Math.min(5, Math.max(-5, levelDiff * 2));
  }

  // ===== TANK/FRONTLINE BONUS =====
  const tankBonus = (isTop || isSupport) && damageTakenShare >= 25
    ? Math.min(8, (damageTakenShare - 20) * 0.5)
    : 0;

  // ===== OVERALL SCORE CALCULATION =====
  const winBonus = isWin ? 8 : 0;

  let weights = { combat: 0.30, farming: 0.25, vision: 0.15, objectives: 0.15, bonus: 0.15 };

  if (isSupport) {
    weights = { combat: 0.25, farming: 0.10, vision: 0.35, objectives: 0.15, bonus: 0.15 };
  } else if (isJungler) {
    weights = { combat: 0.25, farming: 0.20, vision: 0.15, objectives: 0.25, bonus: 0.15 };
  } else if (isADC) {
    weights = { combat: 0.30, farming: 0.30, vision: 0.10, objectives: 0.15, bonus: 0.15 };
  } else if (isTop) {
    weights = { combat: 0.25, farming: 0.25, vision: 0.10, objectives: 0.20, bonus: 0.20 };
  }

  const bonusScore = Math.min(100, 25 + xpBonus + tankBonus + winBonus + (goldDiffBonus > 5 ? 5 : 0));

  // ===== PENALTIES FOR TERRIBLE PERFORMANCE =====
  let penalty = 0;

  if (participant.deaths > 8) {
    penalty += (participant.deaths - 8) * 4;
  }

  if (kda < 0.5) {
    penalty += 15;
  } else if (kda < 1.0) {
    penalty += 8;
  }

  if (!isSupport && killParticipation < 25 && teamTotalKills > 5) {
    penalty += Math.max(0, (25 - killParticipation) * 0.5);
  }

  if ((isADC || isMid) && damageShareTeam < 10 && minutes > 15) {
    penalty += Math.max(0, (10 - damageShareTeam) * 1.5);
  }

  const avgTeamGold = teamTotalGold / 5;
  const goldRatio = participant.goldEarned / avgTeamGold;
  if (!isSupport && goldRatio < 0.7) {
    penalty += Math.max(0, (0.7 - goldRatio) * 30);
  }

  const netContribution = participant.kills + participant.assists - participant.deaths;
  if (netContribution < -5) {
    penalty += Math.abs(netContribution + 5) * 2;
  }

  const overall = Math.min(100, Math.max(0, Math.round(
    combat * weights.combat +
    farming * weights.farming +
    vision * weights.vision +
    objectives * weights.objectives +
    bonusScore * weights.bonus -
    penalty
  )));

  // ===== GRADE CALCULATION =====
  let grade: GameScore['grade'];
  if (overall >= 82) grade = 'S+';
  else if (overall >= 70) grade = 'S';
  else if (overall >= 58) grade = 'A';
  else if (overall >= 45) grade = 'B';
  else if (overall >= 32) grade = 'C';
  else grade = 'D';

  // ===== INSIGHTS & IMPROVEMENTS =====
  const insights: string[] = [];
  const improvements: string[] = [];

  // KDA insights
  if (kda >= 6) insights.push(`${kda.toFixed(1)} KDA - hard carry performance`);
  else if (kda >= 4) insights.push(`${kda.toFixed(1)} KDA - minimal deaths, high impact`);
  else if (kda >= 2.5) insights.push(`${kda.toFixed(1)} KDA - solid game`);

  if (participant.deaths > 7) {
    improvements.push(`${participant.deaths} deaths - got caught out or took bad fights`);
  } else if (participant.deaths > 5) {
    improvements.push(`${participant.deaths} deaths - check minimap before trading`);
  }

  // Kill Participation
  const kpGood = isSupport || isJungler ? 65 : 50;
  const kpGreat = isSupport || isJungler ? 75 : 65;
  const kpBad = isSupport || isJungler ? 50 : 35;

  if (killParticipation >= kpGreat) {
    insights.push(`${Math.round(killParticipation)}% KP - involved in almost every kill`);
  } else if (killParticipation >= kpGood) {
    insights.push(`${Math.round(killParticipation)}% KP - good team presence`);
  }

  if (killParticipation < kpBad) {
    if (isSupport) {
      improvements.push(`${Math.round(killParticipation)}% KP - roam with jungler or follow ADC`);
    } else if (isJungler) {
      improvements.push(`${Math.round(killParticipation)}% KP - gank more, track enemy jungler`);
    } else {
      improvements.push(`${Math.round(killParticipation)}% KP - TP to fights or rotate faster`);
    }
  }

  // VS Opponent (only with team data)
  if (opponent && hasTeamData) {
    const oppName = opponent.championName;

    if (goldDiff > 2500) {
      insights.push(`Stomped ${oppName}: +${Math.round(goldDiff)}g lead`);
    } else if (goldDiff > 1200) {
      insights.push(`Won vs ${oppName}: +${Math.round(goldDiff)}g`);
    } else if (goldDiff < -2500) {
      improvements.push(`${oppName} had +${Math.abs(Math.round(goldDiff))}g - died early or got zoned`);
    } else if (goldDiff < -1200) {
      improvements.push(`${oppName} +${Math.abs(Math.round(goldDiff))}g ahead - farm safer`);
    }

    if (!isSupport && !isJungler) {
      if (csDiff > 40) {
        insights.push(`+${csDiff} CS vs ${oppName}`);
      } else if (csDiff < -40) {
        improvements.push(`${oppName} +${Math.abs(csDiff)} CS - last-hit better`);
      }
    }
  }

  // Damage
  if (!isSupport) {
    if (damageShareTeam >= 30) {
      insights.push(`${Math.round(damageShareTeam)}% team damage - main carry`);
    } else if (damageShareTeam >= 25) {
      insights.push(`${Math.round(damageShareTeam)}% team damage - high DPS`);
    }

    if (damageShareTeam < 12 && (isADC || isMid)) {
      improvements.push(`${Math.round(damageShareTeam)}% damage - arrived late to fights`);
    }
  }

  // Farming
  if (!isSupport) {
    if (isJungler) {
      if (jungleCampsPerMin >= 5) {
        insights.push(`${jungleCampsPerMin.toFixed(1)} camps/min - efficient pathing`);
      } else if (jungleCampsPerMin < 3.5) {
        improvements.push(`${jungleCampsPerMin.toFixed(1)} camps/min - full clear more`);
      }
    } else {
      const csGreat = isTop ? 7 : 8;
      const csBad = isTop ? 5 : 5.5;

      if (csPerMin >= csGreat) {
        insights.push(`${csPerMin.toFixed(1)} CS/min - clean farming`);
      }
      if (csPerMin < csBad) {
        improvements.push(`${csPerMin.toFixed(1)} CS/min - practice last-hitting`);
      }
    }
  }

  // Vision
  const visionGreat = isSupport ? 2.0 : isJungler ? 0.9 : 0.7;
  const visionBad = isSupport ? 1.2 : isJungler ? 0.5 : 0.4;

  if (visionPerMin >= visionGreat) {
    insights.push(`${visionPerMin.toFixed(1)} vision/min - great awareness`);
  }
  if (visionPerMin < visionBad) {
    improvements.push(`${visionPerMin.toFixed(1)} vision/min - buy pinks, use trinket`);
  }

  if (controlWardsBought >= 5) {
    insights.push(`${controlWardsBought} control wards`);
  } else if (controlWardsBought <= 1 && minutes > 20) {
    improvements.push(`Only ${controlWardsBought} pink - buy one every back`);
  }

  // Objectives
  if (epicSteals > 0) insights.push(`${epicSteals} objective steal${epicSteals > 1 ? 's' : ''}`);
  if (participant.firstBloodKill) insights.push('First blood');
  if (participant.firstTowerKill) insights.push('First tower');
  if (turretKills >= 3) insights.push(`${turretKills} towers taken`);

  // Multi-kills
  if (participant.pentaKills > 0) insights.push('PENTAKILL!');
  else if (participant.quadraKills > 0) insights.push('Quadra kill');
  else if (participant.tripleKills > 0) insights.push('Triple kill');

  // Clean game
  if (isWin && participant.deaths <= 1) insights.push('Near-perfect game');
  else if (isWin && participant.deaths <= 3 && kda >= 4) insights.push('Clean win');

  // Fallback
  if (insights.length === 0) {
    if (isWin) {
      insights.push('Contributed to victory');
    } else {
      insights.push('Tough matchup');
    }
  }

  return {
    overall,
    combat: Math.round(combat),
    farming: Math.round(farming),
    vision: Math.round(vision),
    objectives: Math.round(objectives),
    grade,
    insights: insights.slice(0, 4),
    improvements: improvements.slice(0, 4)
  };
}

/**
 * Calculate full score for DB storage
 * Returns all sub-scores, insights and improvements
 */
export function calculateGameScoreFull(
  participant: Participant,
  allParticipants: Participant[],
  gameDuration: number,
  isWin: boolean,
  teamObjectives?: Team
): GameScoreFull {
  return calculateGameScore(participant, allParticipants, gameDuration, isWin, teamObjectives);
}
