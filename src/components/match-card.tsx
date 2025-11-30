'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Sword, Eye, ChevronDown, Target, Coins, TrendingUp, TrendingDown, Minus, Zap, Shield, Crosshair, Activity, Award, LineChart, Loader2 } from 'lucide-react';
import { getChampionIconUrl, getItemIconUrl, getSummonerSpellIconUrl } from '@/lib/riot-api';
import { TowerIcon, DragonIcon, BaronIcon, HeraldIcon, GrubsIcon, AtakhanIcon } from '@/components/icons/objective-icons';
import { GoldGraph } from '@/components/gold-graph';
import { getQueueInfo } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';
import type { MatchSummary, Participant, TimelineFrame } from '@/types/riot';

// Champion benchmark data from high elo
export interface ChampionBenchmark {
  championId: number;
  championName: string;
  role: string;
  tier: string;
  gamesAnalyzed: number;
  avgKills: number | null; // x100
  avgDeaths: number | null;
  avgAssists: number | null;
  avgKda: number | null; // x100
  winRate: number | null; // x100
  avgCsPerMin: number | null; // x100
  avgGoldPerMin: number | null;
  avgDamagePerMin: number | null;
  avgDamageShare: number | null;
  avgVisionScorePerMin: number | null; // x100
  avgWardsPlaced: number | null;
  avgControlWardsPlaced: number | null;
  avgKillParticipation: number | null;
  avgSoloKills: number | null; // x100
}

// Game performance score calculation
interface GameScore {
  overall: number;
  combat: number;
  farming: number;
  vision: number;
  objectives: number;
  grade: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
  insights: string[];
  improvements: string[];
}

function calculateGameScore(
  participant: Participant,
  allParticipants: Participant[],
  gameDuration: number,
  isWin: boolean,
  teamObjectives?: MatchSummary['teams'][0],
  benchmark?: ChampionBenchmark
): GameScore {
  const minutes = gameDuration / 60;
  const teammates = allParticipants.filter(p => p.teamId === participant.teamId);
  const enemies = allParticipants.filter(p => p.teamId !== participant.teamId);
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
  const teamTotalDeaths = teammates.reduce((sum, p) => sum + p.deaths, 0);
  const teamTotalDamage = teammates.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
  const teamTotalDamageTaken = teammates.reduce((sum, p) => sum + p.totalDamageTaken, 0);
  const teamTotalGold = teammates.reduce((sum, p) => sum + p.goldEarned, 0);
  const teamTotalVision = teammates.reduce((sum, p) => sum + p.visionScore, 0);
  const teamTotalCS = teammates.reduce((sum, p) => sum + p.totalMinionsKilled + p.neutralMinionsKilled, 0);

  // Player's share of team stats (%)
  const killParticipation = teamTotalKills > 0
    ? ((participant.kills + participant.assists) / teamTotalKills) * 100
    : 0;
  const damageShareTeam = teamTotalDamage > 0
    ? (participant.totalDamageDealtToChampions / teamTotalDamage) * 100
    : 0;
  const damageTakenShare = teamTotalDamageTaken > 0
    ? (participant.totalDamageTaken / teamTotalDamageTaken) * 100
    : 0;
  const goldShare = teamTotalGold > 0
    ? (participant.goldEarned / teamTotalGold) * 100
    : 0;

  // ===== VS OPPONENT COMPARISONS =====
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin = cs / minutes;
  const goldPerMin = participant.goldEarned / minutes;
  const visionPerMin = participant.visionScore / minutes;

  let goldDiff = 0;
  let csDiff = 0;
  let xpDiff = 0;
  let visionDiff = 0;
  let damageDiff = 0;
  let killsDiff = 0;
  let deathsDiff = 0;
  let controlWardsDiff = 0;
  let levelDiff = 0;
  let oppKda = 0;
  let oppKillParticipation = 0;
  let oppDamageShare = 0;
  let oppCsPerMin = 0;
  let oppVisionPerMin = 0;

  if (opponent) {
    const oppCs = opponent.totalMinionsKilled + opponent.neutralMinionsKilled;
    const oppTeammates = allParticipants.filter(p => p.teamId === opponent.teamId);
    const oppTeamKills = oppTeammates.reduce((sum, p) => sum + p.kills, 0);
    const oppTeamDamage = oppTeammates.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);

    goldDiff = participant.goldEarned - opponent.goldEarned;
    csDiff = cs - oppCs;
    xpDiff = participant.champExperience - opponent.champExperience;
    visionDiff = participant.visionScore - opponent.visionScore;
    damageDiff = participant.totalDamageDealtToChampions - opponent.totalDamageDealtToChampions;
    killsDiff = participant.kills - opponent.kills;
    deathsDiff = participant.deaths - opponent.deaths;
    controlWardsDiff = (participant.visionWardsBoughtInGame || 0) - (opponent.visionWardsBoughtInGame || 0);
    levelDiff = participant.champLevel - opponent.champLevel;

    oppKda = opponent.deaths === 0
      ? (opponent.kills + opponent.assists) * 1.5
      : (opponent.kills + opponent.assists) / opponent.deaths;
    oppKillParticipation = oppTeamKills > 0
      ? ((opponent.kills + opponent.assists) / oppTeamKills) * 100
      : 0;
    oppDamageShare = oppTeamDamage > 0
      ? (opponent.totalDamageDealtToChampions / oppTeamDamage) * 100
      : 0;
    oppCsPerMin = oppCs / minutes;
    oppVisionPerMin = opponent.visionScore / minutes;
  }

  // ===== HELPER: Compare vs benchmark =====
  // Returns a score 0-100 based on how player compares to benchmark
  // 100 = at benchmark, >100 = better than benchmark (capped at 120), <100 = worse
  const compareVsBenchmark = (playerValue: number, benchmarkValue: number | null | undefined, fallback: number): number => {
    const target = (benchmarkValue != null ? benchmarkValue : fallback);
    if (target === 0) return 50;
    const ratio = playerValue / target;
    // Score: 50 at 0%, 100 at 100% of benchmark, up to 120 at 150%+ of benchmark
    return Math.min(120, Math.max(0, ratio * 100));
  };

  // ===== COMBAT SCORE (0-100) =====
  const kda = participant.deaths === 0
    ? (participant.kills + participant.assists) * 1.5
    : (participant.kills + participant.assists) / participant.deaths;

  // Compare KDA vs benchmark (benchmark avgKda is x100)
  const benchmarkKda = benchmark?.avgKda ? benchmark.avgKda / 100 : null;
  const kdaFallback = isSupport ? 4.0 : 3.0;
  const kdaScore = compareVsBenchmark(kda, benchmarkKda, kdaFallback);

  // KP score - compare vs benchmark
  const benchmarkKp = benchmark?.avgKillParticipation || null;
  const kpFallback = isSupport || isJungler ? 65 : 50;
  const kpScore = compareVsBenchmark(killParticipation, benchmarkKp, kpFallback);

  // Damage share score - compare vs benchmark
  const benchmarkDmgShare = benchmark?.avgDamageShare || null;
  const dmgFallback = isSupport ? 10 : isADC || isMid ? 25 : 18;
  const dmgScore = isSupport
    ? Math.min(100, 70 + damageShareTeam * 2) // Supports still get baseline + small bonus
    : compareVsBenchmark(damageShareTeam, benchmarkDmgShare, dmgFallback);

  // Solo kills bonus (multi kills indicate solo carry potential)
  const soloKillsBonus = Math.min(15, (participant.largestMultiKill || 0) * 3);

  // First blood bonus
  const firstBloodBonus = (participant.firstBloodKill ? 8 : 0) + (participant.firstBloodAssist ? 4 : 0);

  // Combat vs opponent bonus
  const combatVsOppBonus = opponent
    ? Math.min(10, Math.max(-10, (participant.kills - opponent.kills) * 2))
    : 0;

  // Support-specific: CC time and assists ratio
  const ccTimePerMin = (participant.timeCCingOthers || 0) / minutes;
  const assistRatio = teamTotalKills > 0 ? (participant.assists / teamTotalKills) * 100 : 0;
  const ccBonus = isSupport ? Math.min(15, ccTimePerMin * 2) : 0;
  const assistBonus = isSupport ? Math.min(10, (assistRatio / 50) * 10) : 0;

  // Jungler-specific: gank success (assists on lanes)
  const junglerGankBonus = isJungler ? Math.min(10, participant.assists * 1.5) : 0;

  const combatKdaWeight = isSupport ? 0.25 : 0.30;
  const combatKpWeight = isSupport ? 0.25 : 0.25;
  const combatDmgWeight = isSupport ? 0.05 : 0.25;
  const combatBonusWeight = isSupport ? 0.45 : 0.20; // Supports get more from CC/assists

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
  // CS breakdown
  const laneMinions = participant.totalMinionsKilled || 0;
  const jungleCamps = participant.neutralMinionsKilled || 0;
  const jungleCampsPerMin = jungleCamps / minutes;

  // CS/min vs benchmark (benchmark avgCsPerMin is x100)
  const benchmarkCsPerMin = benchmark?.avgCsPerMin ? benchmark.avgCsPerMin / 100 : null;
  const csFallback = isSupport ? 1.5 : isJungler ? 5.5 : isTop ? 7.5 : 8.5;
  const csScore = compareVsBenchmark(csPerMin, benchmarkCsPerMin, csFallback);

  // Jungler-specific: jungle camps efficiency
  const jungleCampsTarget = 5.0;
  const jungleCampsScore = isJungler ? Math.min(100, (jungleCampsPerMin / jungleCampsTarget) * 100) : 0;

  // Gold/min vs benchmark
  const benchmarkGoldPerMin = benchmark?.avgGoldPerMin || null;
  const goldFallback = isSupport ? 320 : isJungler ? 400 : 480;
  const goldScore = compareVsBenchmark(goldPerMin, benchmarkGoldPerMin, goldFallback);

  // CS diff vs opponent bonus (laners only)
  const csDiffBonus = (!isSupport && !isJungler && opponent)
    ? Math.min(15, Math.max(-15, csDiff / 10))
    : 0;

  // Gold diff vs opponent bonus
  const goldDiffBonus = opponent
    ? Math.min(15, Math.max(-15, goldDiff / 500))
    : 0;

  // Jungler vs enemy jungler comparison
  const enemyJungler = enemies.find(e => (e.teamPosition || e.individualPosition) === 'JUNGLE');
  const jungleGoldDiff = (isJungler && enemyJungler)
    ? participant.goldEarned - enemyJungler.goldEarned
    : 0;
  const jungleDiffBonus = isJungler
    ? Math.min(10, Math.max(-10, jungleGoldDiff / 400))
    : 0;

  const farming = isSupport
    ? Math.min(100, goldScore * 0.8 + (goldDiffBonus + 10) * 0.2)
    : isJungler
      ? Math.min(100, jungleCampsScore * 0.40 + goldScore * 0.35 + (jungleDiffBonus + 10) * 0.25)
      : Math.min(100, csScore * 0.45 + goldScore * 0.35 + (csDiffBonus + goldDiffBonus + 20) * 0.20);

  // ===== VISION SCORE (0-100) =====
  // Vision/min vs benchmark (benchmark avgVisionScorePerMin is x100)
  const benchmarkVisionPerMin = benchmark?.avgVisionScorePerMin ? benchmark.avgVisionScorePerMin / 100 : null;
  const visionFallback = isSupport ? 2.2 : isJungler ? 1.0 : 0.7;
  const visionScoreBase = compareVsBenchmark(visionPerMin, benchmarkVisionPerMin, visionFallback);

  // Control wards vs benchmark (benchmark avgControlWardsPlaced is x100)
  const controlWardsBought = participant.visionWardsBoughtInGame || 0;
  const benchmarkControlWards = benchmark?.avgControlWardsPlaced ? benchmark.avgControlWardsPlaced / 100 : null;
  const controlWardFallback = isSupport ? 4 : 2;
  const controlWardBonus = Math.min(15, compareVsBenchmark(controlWardsBought, benchmarkControlWards, controlWardFallback) * 0.15);

  // Wards placed vs benchmark (benchmark avgWardsPlaced is x100)
  const wardsPlaced = participant.wardsPlaced || 0;
  const benchmarkWardsPlaced = benchmark?.avgWardsPlaced ? benchmark.avgWardsPlaced / 100 : null;
  const wardsPlacedFallback = isSupport ? 25 : isJungler ? 10 : 8;
  const wardsPlacedBonus = Math.min(10, compareVsBenchmark(wardsPlaced, benchmarkWardsPlaced, wardsPlacedFallback) * 0.10);

  // Wards killed bonus (denying enemy vision)
  const wardsKilled = participant.wardsKilled || 0;
  const wardsKilledBonus = Math.min(10, wardsKilled * 2);

  // Vision diff vs opponent
  const visionDiffBonus = opponent
    ? Math.min(10, Math.max(-10, visionDiff / 5))
    : 0;

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
  let objectives = 40; // baseline

  // Team objectives contribution
  if (teamObjectives) {
    const towers = teamObjectives.objectives.tower?.kills || 0;
    const dragons = teamObjectives.objectives.dragon?.kills || 0;
    const barons = teamObjectives.objectives.baron?.kills || 0;
    const heralds = teamObjectives.objectives.riftHerald?.kills || 0;
    const inhibs = teamObjectives.objectives.inhibitor?.kills || 0;
    const grubs = teamObjectives.objectives.horde?.kills || 0;

    objectives += towers * 2 + dragons * 4 + barons * 8 + heralds * 3 + inhibs * 4 + grubs * 1.5;
  }

  // Personal objective contributions
  const personalDragons = participant.dragonKills || 0;
  const personalBarons = participant.baronKills || 0;
  const turretKills = participant.turretKills || 0;
  const turretDamage = participant.damageDealtToTurrets || 0;
  const objectiveDamage = participant.damageDealtToObjectives || 0;
  const epicSteals = participant.objectivesStolen || 0;

  // Turret damage bonus (role adjusted)
  const turretDmgTarget = isSupport ? 1000 : isJungler ? 2000 : 4000;
  const turretDmgBonus = Math.min(10, (turretDamage / turretDmgTarget) * 10);

  // Objective damage bonus (mainly for jungler)
  const objDmgBonus = isJungler
    ? Math.min(15, (objectiveDamage / 20000) * 15)
    : Math.min(8, (objectiveDamage / 15000) * 8);

  // Personal kills bonus
  const personalObjBonus = personalDragons * 5 + personalBarons * 10 + turretKills * 3;

  // Epic steals are huge
  const stealBonus = epicSteals * 15;

  // First tower bonus
  const firstTowerBonus = (participant.firstTowerKill ? 5 : 0) + (participant.firstTowerAssist ? 3 : 0);

  objectives = Math.min(100, objectives + turretDmgBonus + objDmgBonus + personalObjBonus + stealBonus + firstTowerBonus);

  // ===== XP AND LEVEL ADVANTAGE =====
  let xpBonus = 0;
  if (opponent) {
    const levelDiff = participant.champLevel - opponent.champLevel;
    xpBonus = Math.min(5, Math.max(-5, levelDiff * 2));
  }

  // ===== TANK/FRONTLINE BONUS (for tanks) =====
  const tankBonus = (isTop || isSupport) && damageTakenShare >= 25
    ? Math.min(8, (damageTakenShare - 20) * 0.5)
    : 0;

  // ===== OVERALL SCORE CALCULATION =====
  const winBonus = isWin ? 8 : 0;

  // Weights by role
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

  const bonusScore = Math.min(100, 50 + xpBonus + tankBonus + winBonus + (goldDiffBonus > 5 ? 5 : 0));

  const overall = Math.min(100, Math.round(
    combat * weights.combat +
    farming * weights.farming +
    vision * weights.vision +
    objectives * weights.objectives +
    bonusScore * weights.bonus
  ));

  // ===== GRADE CALCULATION =====
  let grade: GameScore['grade'];
  if (overall >= 88) grade = 'S+';
  else if (overall >= 78) grade = 'S';
  else if (overall >= 68) grade = 'A';
  else if (overall >= 55) grade = 'B';
  else if (overall >= 42) grade = 'C';
  else grade = 'D';

  // ===== INSIGHTS & IMPROVEMENTS =====
  const insights: string[] = [];
  const improvements: string[] = [];

  // --- KDA ---
  if (kda >= 6) insights.push(`${kda.toFixed(1)} KDA - hard carry performance`);
  else if (kda >= 4) insights.push(`${kda.toFixed(1)} KDA - minimal deaths, high impact`);
  else if (kda >= 2.5) insights.push(`${kda.toFixed(1)} KDA - solid game`);

  if (participant.deaths > 7) {
    improvements.push(`${participant.deaths} deaths - got caught out or took bad fights`);
  } else if (participant.deaths > 5) {
    improvements.push(`${participant.deaths} deaths - check minimap before trading`);
  }

  // --- Kill Participation ---
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

  // --- VS Opponent (Lane Matchup) ---
  if (opponent) {
    const oppName = opponent.championName;

    // Gold diff analysis
    if (goldDiff > 2500) {
      insights.push(`Stomped ${oppName}: +${Math.round(goldDiff)}g lead`);
    } else if (goldDiff > 1200) {
      insights.push(`Won vs ${oppName}: +${Math.round(goldDiff)}g`);
    } else if (goldDiff < -2500) {
      improvements.push(`${oppName} had +${Math.abs(Math.round(goldDiff))}g - died early or got zoned`);
    } else if (goldDiff < -1200) {
      improvements.push(`${oppName} +${Math.abs(Math.round(goldDiff))}g ahead - farm safer, don't force trades`);
    }

    // CS comparison (laners only)
    if (!isSupport && !isJungler) {
      if (csDiff > 40) {
        insights.push(`+${csDiff} CS vs ${oppName} (${csPerMin.toFixed(1)} vs ${oppCsPerMin.toFixed(1)}/min)`);
      } else if (csDiff > 20) {
        insights.push(`CS lead: +${csDiff} vs ${oppName}`);
      } else if (csDiff < -40) {
        improvements.push(`${oppName} +${Math.abs(csDiff)} CS (${oppCsPerMin.toFixed(1)} vs your ${csPerMin.toFixed(1)}/min)`);
      } else if (csDiff < -20) {
        improvements.push(`${oppName} +${Math.abs(csDiff)} CS - they last-hit better under tower`);
      }
    }

    // Kill/Death comparison
    if (killsDiff >= 3) {
      insights.push(`Dominated ${oppName}: ${participant.kills} kills vs their ${opponent.kills}`);
    } else if (killsDiff <= -3) {
      improvements.push(`${oppName} killed you ${opponent.kills} times vs your ${participant.kills} - respect their damage`);
    }

    if (deathsDiff <= -3 && opponent.deaths >= 4) {
      insights.push(`${oppName} died ${opponent.deaths}x - punished their mistakes`);
    } else if (deathsDiff >= 3 && participant.deaths >= 4) {
      improvements.push(`You died ${participant.deaths}x vs ${oppName}'s ${opponent.deaths} - play safer after first death`);
    }

    // Damage comparison
    if (!isSupport) {
      if (damageDiff > 8000) {
        insights.push(`+${Math.round(damageDiff / 1000)}k more damage than ${oppName}`);
      } else if (damageDiff > 4000) {
        insights.push(`Out-damaged ${oppName} by ${Math.round(damageDiff / 1000)}k`);
      } else if (damageDiff < -8000) {
        improvements.push(`${oppName} dealt ${Math.abs(Math.round(damageDiff / 1000))}k more - hit more abilities or auto in fights`);
      } else if (damageDiff < -4000) {
        improvements.push(`${oppName} +${Math.abs(Math.round(damageDiff / 1000))}k damage - position closer in teamfights`);
      }
    }

    // Vision comparison
    if (visionDiff > 15) {
      insights.push(`Vision diff: +${visionDiff} vs ${oppName}`);
    } else if (visionDiff < -15 && !isSupport) {
      improvements.push(`${oppName} +${Math.abs(visionDiff)} vision - buy more pinks, use trinket`);
    } else if (visionDiff < -20 && isSupport) {
      improvements.push(`${oppName} support +${Math.abs(visionDiff)} vision - ward more aggressively`);
    }

    // Control wards comparison
    if (controlWardsDiff >= 3) {
      insights.push(`+${controlWardsDiff} more control wards than ${oppName}`);
    } else if (controlWardsDiff <= -3) {
      improvements.push(`${oppName} bought ${Math.abs(controlWardsDiff)} more pinks than you`);
    }

    // Level diff
    if (levelDiff >= 2) {
      insights.push(`+${levelDiff} levels on ${oppName} - XP advantage in fights`);
    } else if (levelDiff <= -2) {
      improvements.push(`${oppName} +${Math.abs(levelDiff)} levels - don't fight them when behind in XP`);
    }

    // KDA comparison
    if (kda > oppKda + 2 && kda >= 3) {
      insights.push(`KDA diff: ${kda.toFixed(1)} vs ${oppName}'s ${oppKda.toFixed(1)}`);
    } else if (oppKda > kda + 2 && oppKda >= 3) {
      improvements.push(`${oppName} had ${oppKda.toFixed(1)} KDA vs your ${kda.toFixed(1)} - they played cleaner`);
    }

    // Kill participation comparison
    if (killParticipation > oppKillParticipation + 20) {
      insights.push(`${Math.round(killParticipation)}% KP vs ${oppName}'s ${Math.round(oppKillParticipation)}% - more impactful`);
    } else if (oppKillParticipation > killParticipation + 20) {
      improvements.push(`${oppName} had ${Math.round(oppKillParticipation)}% KP vs your ${Math.round(killParticipation)}% - they roamed better`);
    }
  }

  // --- Damage ---
  if (!isSupport) {
    if (damageShareTeam >= 30) {
      insights.push(`${Math.round(damageShareTeam)}% team damage - main carry this game`);
    } else if (damageShareTeam >= 25) {
      insights.push(`${Math.round(damageShareTeam)}% team damage - high DPS output`);
    }

    if (damageShareTeam < 12 && (isADC || isMid)) {
      improvements.push(`${Math.round(damageShareTeam)}% damage - arrived late to fights or got zoned`);
    } else if (damageShareTeam < 15 && isTop) {
      improvements.push(`${Math.round(damageShareTeam)}% damage - splitpush less, group more`);
    }
  } else {
    // Support-specific metrics
    const enemySupport = enemies.find(e => (e.teamPosition || e.individualPosition) === 'UTILITY');

    if (participant.totalHealsOnTeammates > 8000) {
      insights.push(`${Math.round(participant.totalHealsOnTeammates / 1000)}k healing - kept team alive`);
    } else if (participant.totalHealsOnTeammates > 5000) {
      insights.push(`${Math.round(participant.totalHealsOnTeammates / 1000)}k healing`);
    }
    if (participant.totalDamageShieldedOnTeammates > 5000) {
      insights.push(`${Math.round(participant.totalDamageShieldedOnTeammates / 1000)}k shields`);
    }

    // CC time for supports
    if (ccTimePerMin >= 8) insights.push('Heavy CC - locked down key targets');
    else if (ccTimePerMin >= 5) insights.push('Good CC output');
    else if (ccTimePerMin < 3 && minutes > 15) {
      improvements.push('Low CC time - hit more abilities or pick engage champ');
    }

    // Assist ratio for supports
    if (assistRatio >= 60) {
      insights.push(`${Math.round(assistRatio)}% of team kills - playmaker`);
    } else if (assistRatio < 35) {
      improvements.push(`${Math.round(assistRatio)}% assist ratio - stay near carries in fights`);
    }

    // Support vs Support comparison
    if (enemySupport) {
      const enemySuppName = enemySupport.championName;
      const enemySuppVision = enemySupport.visionScore;
      const enemySuppWards = enemySupport.wardsPlaced || 0;
      const enemySuppControlWards = enemySupport.visionWardsBoughtInGame || 0;
      const enemySuppWardsKilled = enemySupport.wardsKilled || 0;
      const enemySuppKP = (() => {
        const enemyTeammates = allParticipants.filter(p => p.teamId === enemySupport.teamId);
        const enemyTeamKills = enemyTeammates.reduce((sum, p) => sum + p.kills, 0);
        return enemyTeamKills > 0 ? ((enemySupport.kills + enemySupport.assists) / enemyTeamKills) * 100 : 0;
      })();
      const enemySuppCC = (enemySupport.timeCCingOthers || 0) / minutes;
      const enemySuppAssists = enemySupport.assists;

      // Vision comparison with enemy support
      if (participant.visionScore > enemySuppVision + 20) {
        insights.push(`Vision gap: ${participant.visionScore} vs ${enemySuppName}'s ${enemySuppVision}`);
      } else if (enemySuppVision > participant.visionScore + 20) {
        improvements.push(`${enemySuppName} had ${enemySuppVision} vision vs your ${participant.visionScore} - ward more`);
      }

      // Ward placement comparison
      if (wardsPlaced > enemySuppWards + 10) {
        insights.push(`+${wardsPlaced - enemySuppWards} more wards placed than ${enemySuppName}`);
      } else if (enemySuppWards > wardsPlaced + 10) {
        improvements.push(`${enemySuppName} placed ${enemySuppWards} wards vs your ${wardsPlaced}`);
      }

      // Wards killed comparison
      if (wardsKilled > enemySuppWardsKilled + 5) {
        insights.push(`Cleared ${wardsKilled} wards vs ${enemySuppName}'s ${enemySuppWardsKilled}`);
      } else if (enemySuppWardsKilled > wardsKilled + 5) {
        improvements.push(`${enemySuppName} killed ${enemySuppWardsKilled} wards vs your ${wardsKilled} - sweep more`);
      }

      // Assist comparison
      if (participant.assists > enemySuppAssists + 5) {
        insights.push(`${participant.assists} assists vs ${enemySuppName}'s ${enemySuppAssists} - higher impact`);
      } else if (enemySuppAssists > participant.assists + 5) {
        improvements.push(`${enemySuppName} had ${enemySuppAssists} assists vs your ${participant.assists} - roam with jungler`);
      }

      // KP comparison
      if (killParticipation > enemySuppKP + 15) {
        insights.push(`${Math.round(killParticipation)}% KP vs ${enemySuppName}'s ${Math.round(enemySuppKP)}%`);
      } else if (enemySuppKP > killParticipation + 15) {
        improvements.push(`${enemySuppName} ${Math.round(enemySuppKP)}% KP vs your ${Math.round(killParticipation)}% - be in more fights`);
      }

      // CC time comparison
      if (ccTimePerMin > enemySuppCC + 2) {
        insights.push(`${Math.round(ccTimePerMin)}s CC/min vs ${enemySuppName}'s ${Math.round(enemySuppCC)}s`);
      } else if (enemySuppCC > ccTimePerMin + 2) {
        improvements.push(`${enemySuppName} ${Math.round(enemySuppCC)}s CC/min vs your ${Math.round(ccTimePerMin)}s - hit more CC`);
      }
    }
  }

  // --- Farming ---
  if (!isSupport) {
    if (isJungler) {
      // Jungler-specific farming insights
      if (jungleCampsPerMin >= 5) {
        insights.push(`${jungleCampsPerMin.toFixed(1)} camps/min - efficient pathing`);
      } else if (jungleCampsPerMin >= 4) {
        insights.push('Solid jungle clear');
      } else if (jungleCampsPerMin < 3.5) {
        improvements.push(`${jungleCampsPerMin.toFixed(1)} camps/min - full clear more, don't afk gank`);
      }

      // Jungler vs enemy jungler - detailed analysis
      if (enemyJungler) {
        const enemyJgName = enemyJungler.championName;
        const enemyJgKills = enemyJungler.kills;
        const enemyJgDeaths = enemyJungler.deaths;
        const enemyJgAssists = enemyJungler.assists;
        const enemyJgCs = enemyJungler.totalMinionsKilled + enemyJungler.neutralMinionsKilled;
        const enemyJgCsPerMin = enemyJgCs / minutes;
        const enemyJgObjectiveDmg = enemyJungler.damageDealtToObjectives || 0;

        if (jungleGoldDiff > 2000) {
          insights.push(`Outjungled ${enemyJgName}: +${Math.round(jungleGoldDiff)}g lead`);
        } else if (jungleGoldDiff > 1000) {
          insights.push(`Ahead of ${enemyJgName}: +${Math.round(jungleGoldDiff)}g`);
        } else if (jungleGoldDiff < -2000) {
          improvements.push(`${enemyJgName} +${Math.abs(Math.round(jungleGoldDiff))}g - they invaded or ganked better`);
        } else if (jungleGoldDiff < -1000) {
          improvements.push(`${enemyJgName} +${Math.abs(Math.round(jungleGoldDiff))}g ahead - track their pathing`);
        }

        // Objective damage comparison
        if (objectiveDamage > enemyJgObjectiveDmg + 5000) {
          insights.push(`+${Math.round((objectiveDamage - enemyJgObjectiveDmg) / 1000)}k more objective dmg than ${enemyJgName}`);
        } else if (enemyJgObjectiveDmg > objectiveDamage + 5000) {
          improvements.push(`${enemyJgName} +${Math.round((enemyJgObjectiveDmg - objectiveDamage) / 1000)}k obj dmg - contest objectives harder`);
        }

        // Gank success comparison
        if (participant.assists > enemyJgAssists + 3) {
          insights.push(`${participant.assists} assists vs ${enemyJgName}'s ${enemyJgAssists} - better gank impact`);
        } else if (enemyJgAssists > participant.assists + 3) {
          improvements.push(`${enemyJgName} had ${enemyJgAssists} assists vs your ${participant.assists} - gank more or countergank`);
        }

        // Clear speed comparison
        if (jungleCampsPerMin > enemyJgCsPerMin + 0.8) {
          insights.push(`Faster clear: ${jungleCampsPerMin.toFixed(1)} vs ${enemyJgName}'s ${enemyJgCsPerMin.toFixed(1)} camps/min`);
        } else if (enemyJgCsPerMin > jungleCampsPerMin + 0.8) {
          improvements.push(`${enemyJgName} cleared ${enemyJgCsPerMin.toFixed(1)} vs your ${jungleCampsPerMin.toFixed(1)} camps/min`);
        }
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

  // --- Vision ---
  const visionGreat = isSupport ? 2.0 : isJungler ? 0.9 : 0.7;
  const visionBad = isSupport ? 1.2 : isJungler ? 0.5 : 0.4;

  if (visionPerMin >= visionGreat) {
    insights.push(isSupport
      ? `${visionPerMin.toFixed(1)} vision/min - map control`
      : `${visionPerMin.toFixed(1)} vision/min - great awareness`);
  }
  if (visionPerMin < visionBad) {
    improvements.push(isSupport
      ? `${visionPerMin.toFixed(1)} vision/min - use support item charges`
      : `${visionPerMin.toFixed(1)} vision/min - buy pinks, use trinket`);
  }

  // Control wards
  if (controlWardsBought >= 5) {
    insights.push(`${controlWardsBought} control wards - secured key areas`);
  } else if (controlWardsBought >= 3) {
    insights.push(`${controlWardsBought} control wards`);
  } else if (controlWardsBought <= 1 && minutes > 20) {
    improvements.push(`Only ${controlWardsBought} pink - buy one every back`);
  }

  // Wards placed (especially for supports)
  if (isSupport) {
    if (wardsPlaced >= 25) insights.push(`${wardsPlaced} wards placed - map lit up`);
    else if (wardsPlaced < 15 && minutes > 20) {
      improvements.push(`${wardsPlaced} wards in ${Math.round(minutes)}min - use trinket on CD`);
    }
  }

  // Wards killed (vision denial)
  if (wardsKilled >= 8) insights.push(`${wardsKilled} wards killed - denied enemy info`);
  else if (wardsKilled >= 5) insights.push(`${wardsKilled} wards cleared`);
  else if (isSupport && wardsKilled < 3 && minutes > 20) {
    improvements.push(`${wardsKilled} wards cleared - sweep more, deny vision`);
  }

  // --- Objectives ---
  if (epicSteals > 0) insights.push(`${epicSteals} objective steal${epicSteals > 1 ? 's' : ''} - clutch smite`);
  if (participant.firstBloodKill) insights.push('First blood - early lead secured');
  if (participant.firstTowerKill) insights.push('First tower - map opened up');

  if (turretKills >= 3) insights.push(`${turretKills} towers taken - pushed objectives`);
  else if (isTop && turretDamage < 2000 && minutes > 20) {
    improvements.push(`${Math.round(turretDamage)} tower dmg - hit plates after kills`);
  }

  if (isJungler) {
    if (personalDragons >= 3) insights.push(`${personalDragons} dragons secured`);
    else if (personalDragons === 0 && minutes > 25) {
      improvements.push('0 dragons - setup vision, call for prio');
    }
    if (personalBarons >= 1) insights.push('Secured baron');

    // Objective damage for junglers
    if (objectiveDamage > 25000) {
      insights.push(`${Math.round(objectiveDamage / 1000)}k objective damage`);
    } else if (objectiveDamage < 10000 && minutes > 20) {
      improvements.push(`${Math.round(objectiveDamage / 1000)}k obj dmg - hit dragon/baron more`);
    }
  }

  // --- Tank duty ---
  if ((isTop || isSupport) && damageTakenShare >= 30) {
    insights.push(`${Math.round(damageTakenShare)}% dmg taken - strong frontline`);
  }

  // --- Multi-kills ---
  if (participant.pentaKills > 0) insights.push('PENTAKILL! Team ace secured');
  else if (participant.quadraKills > 0) insights.push('Quadra kill - almost the penta');
  else if (participant.tripleKills > 0) insights.push('Triple kill');

  // --- Clean game ---
  if (isWin && participant.deaths <= 1) insights.push('Near-perfect game - almost deathless');
  else if (isWin && participant.deaths <= 3 && kda >= 4) insights.push('Clean win - minimal mistakes');

  // --- Benchmark comparisons (vs high elo average) ---
  if (benchmark && benchmark.gamesAnalyzed >= 50) {
    const benchmarkKdaVal = benchmarkKda || kdaFallback;
    const benchmarkCsVal = benchmarkCsPerMin || csFallback;
    const benchmarkVisionVal = benchmarkVisionPerMin || visionFallback;

    // KDA vs benchmark
    if (kda > benchmarkKdaVal * 1.3) {
      insights.push(`KDA ${((kda / benchmarkKdaVal) * 100 - 100).toFixed(0)}% above ${benchmark.championName} avg`);
    } else if (kda < benchmarkKdaVal * 0.7) {
      improvements.push(`KDA ${((1 - kda / benchmarkKdaVal) * 100).toFixed(0)}% below ${benchmark.championName} avg`);
    }

    // CS vs benchmark (laners)
    if (!isSupport) {
      if (csPerMin > benchmarkCsVal * 1.15) {
        insights.push(`CS/min ${((csPerMin / benchmarkCsVal) * 100 - 100).toFixed(0)}% above avg`);
      } else if (csPerMin < benchmarkCsVal * 0.8) {
        improvements.push(`CS/min ${((1 - csPerMin / benchmarkCsVal) * 100).toFixed(0)}% below avg - practice CSing`);
      }
    }

    // Vision vs benchmark
    if (visionPerMin > benchmarkVisionVal * 1.3) {
      insights.push(`Vision ${((visionPerMin / benchmarkVisionVal) * 100 - 100).toFixed(0)}% above avg`);
    } else if (visionPerMin < benchmarkVisionVal * 0.6) {
      improvements.push(`Vision ${((1 - visionPerMin / benchmarkVisionVal) * 100).toFixed(0)}% below avg`);
    }
  }

  // --- Fallback if no insights ---
  if (insights.length === 0) {
    if (isWin) {
      insights.push('Contributed to victory');
    } else {
      insights.push('Tough matchup - review what went wrong');
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

interface MatchCardProps {
  match: MatchSummary;
  currentPuuid: string;
  region: string;
  delay?: number;
  benchmarks?: Record<string, ChampionBenchmark>; // Map of "championId-role" -> benchmark
}

export function MatchCard({ match, currentPuuid, region, delay = 0, benchmarks }: MatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'gold'>('overview');
  const [timelineData, setTimelineData] = useState<TimelineFrame[] | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<ProcessedEvent[] | null>(null);
  const [timelineTeamfights, setTimelineTeamfights] = useState<Teamfight[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const { participant } = match;
  const queueInfo = getQueueInfo(match.queueId);

  const kda = participant.deaths === 0
    ? 'Perfect'
    : ((participant.kills + participant.assists) / participant.deaths).toFixed(2);

  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin = (cs / (match.gameDuration / 60)).toFixed(1);

  // Keep all 6 item slots for consistent layout
  const items = [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
  ];

  const trinket = participant.item6;

  const timeAgo = getTimeAgo(match.gameCreation);
  const duration = formatDuration(match.gameDuration);

  // Split teams
  const blueTeam = match.allParticipants?.filter(p => p.teamId === 100) || [];
  const redTeam = match.allParticipants?.filter(p => p.teamId === 200) || [];
  const playerTeam = participant.teamId === 100 ? blueTeam : redTeam;
  const enemyTeam = participant.teamId === 100 ? redTeam : blueTeam;

  // Calculate kill participation
  const teamKills = playerTeam.reduce((sum, p) => sum + p.kills, 0);
  const killParticipation = teamKills > 0
    ? Math.round(((participant.kills + participant.assists) / teamKills) * 100)
    : 0;

  // Get benchmark for this champion/role
  const playerBenchmark = useMemo(() => {
    if (!benchmarks) return undefined;
    const role = participant.teamPosition || participant.individualPosition || '';
    const normalizedRole = role === 'UTILITY' ? 'UTILITY' : role === 'BOTTOM' ? 'BOTTOM' : role;
    return benchmarks[`${participant.championId}-${normalizedRole}`];
  }, [benchmarks, participant]);

  // Calculate game score
  const gameScore = useMemo(() => {
    if (!match.allParticipants) return null;
    const teamObjectives = match.teams?.find(t => t.teamId === participant.teamId);
    return calculateGameScore(
      participant,
      match.allParticipants,
      match.gameDuration,
      match.win,
      teamObjectives,
      playerBenchmark
    );
  }, [match, participant, playerBenchmark]);

  // Fetch timeline data when gold tab is selected
  const fetchTimeline = useCallback(async () => {
    if (timelineData || timelineLoading) return;

    setTimelineLoading(true);
    setTimelineError(null);

    try {
      const response = await fetch(`/api/timeline/${match.matchId}?region=${region}`);
      if (!response.ok) {
        throw new Error('Failed to fetch timeline');
      }
      const data = await response.json();
      setTimelineData(data.frames);
      setTimelineEvents(data.events || null);
      setTimelineTeamfights(data.teamfights || null);
    } catch (err) {
      setTimelineError('Could not load gold graph');
      console.error('Timeline fetch error:', err);
    } finally {
      setTimelineLoading(false);
    }
  }, [match.matchId, region, timelineData, timelineLoading]);

  // Handle tab change
  const handleTabChange = useCallback((tab: 'overview' | 'analysis' | 'gold') => {
    setActiveTab(tab);
    if (tab === 'gold' && !timelineData && !timelineLoading) {
      fetchTimeline();
    }
  }, [fetchTimeline, timelineData, timelineLoading]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      {/* Main card - clickable */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'group relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border transition-all cursor-pointer',
          isExpanded ? 'rounded-t-xl' : 'rounded-xl',
          'hover:bg-card/70',
          match.win
            ? 'bg-primary/5 border-primary/20 hover:border-primary/40'
            : 'bg-[#ef4444]/5 border-[#ef4444]/20 hover:border-[#ef4444]/40'
        )}
      >
        {/* Win/Loss indicator bar */}
        <div
          className={cn(
            'absolute left-0 top-2 bottom-2 w-1 rounded-full',
            match.win ? 'bg-primary' : 'bg-[#ef4444]'
          )}
        />

        {/* Champion */}
        <div className="relative flex-shrink-0 ml-2">
          <Image
            src={getChampionIconUrl(participant.championName)}
            alt={participant.championName}
            width={56}
            height={56}
            className="rounded-xl"
            unoptimized
          />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold">
            {participant.champLevel}
          </div>
        </div>

        {/* Summoner Spells */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <Image
            src={getSummonerSpellIconUrl(participant.summoner1Id)}
            alt="Spell 1"
            width={22}
            height={22}
            className="rounded"
            unoptimized
          />
          <Image
            src={getSummonerSpellIconUrl(participant.summoner2Id)}
            alt="Spell 2"
            width={22}
            height={22}
            className="rounded"
            unoptimized
          />
        </div>

        {/* Game Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'text-sm font-semibold',
              match.win ? 'text-primary' : 'text-[#ef4444]'
            )}>
              {match.win ? 'Victory' : 'Defeat'}
            </span>
            <span className="text-xs text-muted-foreground">{queueInfo.shortName}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>

          {/* KDA */}
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-lg font-bold">
              <span>{participant.kills}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-[#ef4444]">{participant.deaths}</span>
              <span className="text-muted-foreground">/</span>
              <span>{participant.assists}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className={cn(
                'font-medium',
                parseFloat(kda) >= 3 ? 'text-primary' : parseFloat(kda) >= 2 ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {kda}
              </span>
              {' '}KDA
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
            <span className="flex items-center gap-1">
              <Sword className="h-3 w-3" />
              {cs} ({csPerMin})
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {participant.visionScore}
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <Target className="h-3 w-3" />
              {killParticipation}% KP
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="hidden sm:flex flex-col gap-1">
          <div className="flex gap-0.5">
            {items.slice(0, 3).map((itemId, idx) => (
              <ItemSlot key={idx} itemId={itemId} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {items.slice(3, 6).map((itemId, idx) => (
              <ItemSlot key={idx + 3} itemId={itemId} />
            ))}
            <ItemSlot itemId={trinket} isTrinket />
          </div>
        </div>

        {/* Game Score Badge - Refined design */}
        {gameScore && (
          <div className="hidden sm:flex flex-col items-center justify-center px-2">
            <div className={cn(
              'relative w-11 h-11 rounded-lg flex items-center justify-center border backdrop-blur-sm transition-all',
              gameScore.grade === 'S+' && 'bg-primary/15 border-primary/50 shadow-[0_0_20px_rgba(99,102,241,0.3)]',
              gameScore.grade === 'S' && 'bg-primary/10 border-primary/40 shadow-[0_0_12px_rgba(99,102,241,0.2)]',
              gameScore.grade === 'A' && 'bg-primary/5 border-primary/25',
              gameScore.grade === 'B' && 'bg-muted/30 border-border/50',
              gameScore.grade === 'C' && 'bg-muted/20 border-border/40',
              gameScore.grade === 'D' && 'bg-destructive/10 border-destructive/30',
            )}>
              <span className={cn(
                'text-base font-semibold font-mono tracking-tight',
                gameScore.grade === 'S+' && 'text-primary',
                gameScore.grade === 'S' && 'text-primary',
                gameScore.grade === 'A' && 'text-primary/80',
                gameScore.grade === 'B' && 'text-foreground/70',
                gameScore.grade === 'C' && 'text-muted-foreground',
                gameScore.grade === 'D' && 'text-destructive/80',
              )}>
                {gameScore.grade}
              </span>
            </div>
            <div className="flex items-center gap-0.5 mt-1">
              <span className={cn(
                'text-[10px] font-medium tabular-nums',
                gameScore.overall >= 78 ? 'text-primary/70' :
                gameScore.overall >= 55 ? 'text-foreground/50' :
                'text-muted-foreground'
              )}>
                {gameScore.overall}
              </span>
            </div>
          </div>
        )}

        {/* Expand indicator */}
        <ChevronDown
          className={cn(
            'h-5 w-5 text-muted-foreground transition-transform flex-shrink-0',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && match.allParticipants && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'overflow-hidden border border-t-0 rounded-b-xl',
              match.win
                ? 'bg-primary/5 border-primary/20'
                : 'bg-[#ef4444]/5 border-[#ef4444]/20'
            )}
          >
            {/* Tabs */}
            <div className="flex border-b border-border/30">
              <button
                onClick={(e) => { e.stopPropagation(); handleTabChange('overview'); }}
                className={cn(
                  'flex-1 px-4 py-2.5 text-sm font-medium transition-all',
                  activeTab === 'overview'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Overview
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleTabChange('analysis'); }}
                className={cn(
                  'flex-1 px-4 py-2.5 text-sm font-medium transition-all',
                  activeTab === 'analysis'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Analysis
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleTabChange('gold'); }}
                className={cn(
                  'flex-1 px-4 py-2.5 text-sm font-medium transition-all flex items-center justify-center',
                  activeTab === 'gold'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Gold Graph
              </button>
            </div>

            {/* Tab content */}
            <div className="p-4">
              {activeTab === 'overview' ? (
                <motion.div
                  className="space-y-3"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: {
                        staggerChildren: 0.03,
                        delayChildren: 0.02
                      }
                    }
                  }}
                >
                  {/* Your team */}
                  <div>
                    <motion.div
                      className="text-xs font-medium mb-2 flex items-center gap-2 flex-wrap"
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        visible: {
                          opacity: 1,
                          x: 0,
                          transition: {
                            duration: 0.3,
                            ease: [0.25, 0.46, 0.45, 0.94] as const
                          }
                        }
                      }}
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        participant.teamId === 100 ? 'bg-blue-500' : 'bg-red-500'
                      )} />
                      <span className={cn(
                        'font-semibold',
                        match.win ? 'text-primary' : 'text-[#ef4444]'
                      )}>
                        {match.win ? 'Victory' : 'Defeat'}
                      </span>
                      <span className="text-muted-foreground">
                        - {participant.teamId === 100 ? 'Blue' : 'Red'} Team
                      </span>
                      <TeamObjectives team={match.teams?.find(t => t.teamId === participant.teamId)} />
                    </motion.div>
                    <div className="space-y-1">
                      {playerTeam.map((p) => (
                        <motion.div
                          key={p.puuid}
                          variants={{
                            hidden: { opacity: 0, x: -12, scale: 0.97 },
                            visible: {
                              opacity: 1,
                              x: 0,
                              scale: 1,
                              transition: {
                                duration: 0.28,
                                ease: [0.25, 0.46, 0.45, 0.94] as const
                              }
                            }
                          }}
                        >
                          <PlayerRow
                            player={p}
                            region={region}
                            gameDuration={match.gameDuration}
                            isCurrentPlayer={p.puuid === currentPuuid}
                            maxDamage={Math.max(...match.allParticipants.map(x => x.totalDamageDealtToChampions))}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Enemy team */}
                  <div>
                    <motion.div
                      className="text-xs font-medium mb-2 flex items-center gap-2 flex-wrap"
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        visible: {
                          opacity: 1,
                          x: 0,
                          transition: {
                            duration: 0.3,
                            ease: [0.25, 0.46, 0.45, 0.94] as const
                          }
                        }
                      }}
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        participant.teamId === 100 ? 'bg-red-500' : 'bg-blue-500'
                      )} />
                      <span className={cn(
                        'font-semibold',
                        !match.win ? 'text-primary' : 'text-[#ef4444]'
                      )}>
                        {!match.win ? 'Victory' : 'Defeat'}
                      </span>
                      <span className="text-muted-foreground">
                        - {participant.teamId === 100 ? 'Red' : 'Blue'} Team
                      </span>
                      <TeamObjectives team={match.teams?.find(t => t.teamId !== participant.teamId)} />
                    </motion.div>
                    <div className="space-y-1">
                      {enemyTeam.map((p) => (
                        <motion.div
                          key={p.puuid}
                          variants={{
                            hidden: { opacity: 0, x: 12, scale: 0.97 },
                            visible: {
                              opacity: 1,
                              x: 0,
                              scale: 1,
                              transition: {
                                duration: 0.28,
                                ease: [0.25, 0.46, 0.45, 0.94] as const
                              }
                            }
                          }}
                        >
                          <PlayerRow
                            player={p}
                            region={region}
                            gameDuration={match.gameDuration}
                            isCurrentPlayer={p.puuid === currentPuuid}
                            maxDamage={Math.max(...match.allParticipants.map(x => x.totalDamageDealtToChampions))}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'analysis' ? (
                <GameAnalysisTab
                  participant={participant}
                  allParticipants={match.allParticipants}
                  gameDuration={match.gameDuration}
                  isWin={match.win}
                  gameScore={gameScore}
                  teamObjectives={match.teams?.find(t => t.teamId === participant.teamId)}
                />
              ) : (
                <GoldGraphTab
                  timelineData={timelineData}
                  loading={timelineLoading}
                  error={timelineError}
                  allParticipants={match.allParticipants}
                  currentPuuid={currentPuuid}
                  playerTeamId={participant.teamId}
                  events={timelineEvents || undefined}
                  teamfights={timelineTeamfights || undefined}
                  participant={participant}
                  gameDuration={match.gameDuration}
                  isWin={match.win}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TeamObjectives({ team }: { team?: MatchSummary['teams'][0] }) {
  if (!team) return null;

  // Build objectives list with icons and counts
  const objectives: { icon: React.ReactNode; count: number; color: string }[] = [];

  if (team.objectives.horde?.kills > 0) {
    objectives.push({
      icon: <GrubsIcon className="w-3.5 h-3.5" />,
      count: team.objectives.horde.kills,
      color: 'text-violet-400'
    });
  }
  if (team.objectives.dragon?.kills > 0) {
    objectives.push({
      icon: <DragonIcon className="w-3.5 h-3.5" />,
      count: team.objectives.dragon.kills,
      color: 'text-amber-400'
    });
  }
  if (team.objectives.riftHerald?.kills > 0) {
    objectives.push({
      icon: <HeraldIcon className="w-3.5 h-3.5" />,
      count: team.objectives.riftHerald.kills,
      color: 'text-purple-400'
    });
  }
  if (team.objectives.baron?.kills > 0) {
    objectives.push({
      icon: <BaronIcon className="w-3.5 h-3.5" />,
      count: team.objectives.baron.kills,
      color: 'text-fuchsia-400'
    });
  }
  // Check for atakhan if available in API
  const atakhanObjective = (team.objectives as { atakhan?: { kills: number } }).atakhan;
  if (atakhanObjective && atakhanObjective.kills > 0) {
    objectives.push({
      icon: <AtakhanIcon className="w-3.5 h-3.5" />,
      count: atakhanObjective.kills,
      color: 'text-emerald-400'
    });
  }
  // Combine towers + inhibitors
  const towers = team.objectives.tower?.kills || 0;
  const inhibitors = team.objectives.inhibitor?.kills || 0;
  const structures = towers + inhibitors;
  if (structures > 0) {
    objectives.push({
      icon: <TowerIcon className="w-3.5 h-3.5" />,
      count: structures,
      color: 'text-sky-400'
    });
  }

  if (objectives.length === 0) return null;

  return (
    <div className="flex items-center gap-2 ml-1">
      {objectives.map((obj, idx) => (
        <span key={idx} className="flex items-center gap-0.5">
          <span className={obj.color}>{obj.icon}</span>
          <span className="text-xs font-medium text-foreground">{obj.count}</span>
        </span>
      ))}
    </div>
  );
}

// Game Analysis Tab Component
function GameAnalysisTab({
  participant,
  allParticipants,
  gameDuration,
  isWin,
  gameScore,
  teamObjectives
}: {
  participant: Participant;
  allParticipants: Participant[];
  gameDuration: number;
  isWin: boolean;
  gameScore: GameScore | null;
  teamObjectives?: MatchSummary['teams'][0];
}) {
  const minutes = gameDuration / 60;
  const teammates = allParticipants.filter(p => p.teamId === participant.teamId);
  const enemies = allParticipants.filter(p => p.teamId !== participant.teamId);
  const position = participant.teamPosition || participant.individualPosition || '';
  const isSupport = position === 'UTILITY';
  const isJungler = position === 'JUNGLE';

  // Find lane opponent
  const opponent = enemies.find(e =>
    (e.teamPosition || e.individualPosition) === position
  );

  // Calculate all stats
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin = cs / minutes;
  const goldPerMin = participant.goldEarned / minutes;
  const damagePerMin = participant.totalDamageDealtToChampions / minutes;

  const teamKills = teammates.reduce((sum, p) => sum + p.kills, 0);
  const teamDamage = teammates.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
  const killParticipation = teamKills > 0 ? ((participant.kills + participant.assists) / teamKills) * 100 : 0;
  const damageShare = teamDamage > 0 ? (participant.totalDamageDealtToChampions / teamDamage) * 100 : 0;

  const kda = participant.deaths === 0
    ? (participant.kills + participant.assists)
    : ((participant.kills + participant.assists) / participant.deaths);

  // Opponent stats
  const oppCs = opponent ? opponent.totalMinionsKilled + opponent.neutralMinionsKilled : 0;
  const oppCsPerMin = opponent ? oppCs / minutes : 0;
  const csDiff = cs - oppCs;
  const goldDiff = opponent ? participant.goldEarned - opponent.goldEarned : 0;
  const damageDiff = opponent ? participant.totalDamageDealtToChampions - opponent.totalDamageDealtToChampions : 0;
  const visionDiff = opponent ? participant.visionScore - opponent.visionScore : 0;

  // Challenges data
  const challenges = participant.challenges || {};
  const soloKills = challenges.soloKills || 0;
  const turretPlates = challenges.turretPlatesTaken || 0;
  const maxCsAdvantage = challenges.maxCsAdvantageOnLaneOpponent || 0;

  if (!gameScore) return null;

  // Grade colors - refined, Linear-inspired design
  // Uses primary (indigo) for good grades, transitions to muted, then destructive
  const gradeConfig = {
    'S+': {
      bg: 'bg-primary/15',
      border: 'border-primary/50',
      text: 'text-primary',
      glow: 'shadow-[0_0_20px_rgba(99,102,241,0.3)]',
      ring: 'ring-1 ring-primary/30',
      barBg: 'bg-primary',
    },
    'S': {
      bg: 'bg-primary/10',
      border: 'border-primary/40',
      text: 'text-primary',
      glow: 'shadow-[0_0_12px_rgba(99,102,241,0.2)]',
      ring: 'ring-1 ring-primary/20',
      barBg: 'bg-primary',
    },
    'A': {
      bg: 'bg-primary/5',
      border: 'border-primary/25',
      text: 'text-primary/80',
      glow: '',
      ring: 'ring-1 ring-primary/15',
      barBg: 'bg-primary/80',
    },
    'B': {
      bg: 'bg-muted/30',
      border: 'border-border/50',
      text: 'text-foreground/70',
      glow: '',
      ring: 'ring-1 ring-border/30',
      barBg: 'bg-foreground/50',
    },
    'C': {
      bg: 'bg-muted/20',
      border: 'border-border/40',
      text: 'text-muted-foreground',
      glow: '',
      ring: 'ring-1 ring-border/20',
      barBg: 'bg-muted-foreground/60',
    },
    'D': {
      bg: 'bg-destructive/10',
      border: 'border-destructive/30',
      text: 'text-destructive/80',
      glow: '',
      ring: 'ring-1 ring-destructive/20',
      barBg: 'bg-destructive/70',
    },
  };
  const grade = gradeConfig[gameScore.grade] || gradeConfig['C'];

  // Stagger animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.02
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12, scale: 0.97 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const scaleVariants = {
    hidden: { opacity: 0, scale: 0.85 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const slideLeftVariants = {
    hidden: { opacity: 0, x: -15 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const slideRightVariants = {
    hidden: { opacity: 0, x: 15 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  return (
    <motion.div
      className="space-y-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Top Row: Grade + Core Stats */}
      <div className="grid grid-cols-12 gap-3">
        {/* Grade Card - Refined design */}
        <motion.div
          variants={scaleVariants}
          className="col-span-3 relative"
        >
          <div className={cn(
            'h-full rounded-xl border backdrop-blur-sm p-4 flex flex-col items-center justify-center transition-all',
            grade.bg,
            grade.border,
            grade.glow,
            grade.ring
          )}>
            <div className={cn(
              'text-3xl font-bold font-mono tracking-tight',
              grade.text
            )}>
              {gameScore.grade}
            </div>
            <div className="text-[9px] text-muted-foreground mt-1.5 uppercase tracking-[0.15em] font-medium">Score</div>
            <div className={cn('mt-2 text-xl font-semibold tabular-nums', grade.text)}>{gameScore.overall}</div>
            <div className="w-full bg-muted/20 rounded-full h-1 mt-2 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${gameScore.overall}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={cn('h-full rounded-full', grade.barBg)}
              />
            </div>
          </div>
        </motion.div>

        {/* KDA Display */}
        <motion.div variants={itemVariants} className="col-span-5 rounded-xl border border-border/40 bg-card/50 p-3">
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-2xl font-bold tabular-nums">{participant.kills}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-2xl font-bold tabular-nums text-destructive">{participant.deaths}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-2xl font-bold tabular-nums">{participant.assists}</span>
            <span className={cn(
              'ml-2 text-sm font-semibold',
              kda >= 4 ? 'text-amber-400' : kda >= 2.5 ? 'text-primary' : kda >= 1.5 ? 'text-foreground' : 'text-destructive'
            )}>
              {kda.toFixed(2)} KDA
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kill Part.</span>
              <span className={cn('font-medium', killParticipation >= 60 ? 'text-primary' : '')}>{killParticipation.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DMG Share</span>
              <span className={cn('font-medium', damageShare >= 25 ? 'text-primary' : '')}>{damageShare.toFixed(0)}%</span>
            </div>
          </div>
        </motion.div>

        {/* Score Bars - Compact */}
        <motion.div variants={itemVariants} className="col-span-4 rounded-xl border border-border/40 bg-card/50 p-3 space-y-2">
          <CompactScoreBar label="Combat" value={gameScore.combat} />
          <CompactScoreBar label="Farm" value={gameScore.farming} />
          <CompactScoreBar label="Vision" value={gameScore.vision} />
          <CompactScoreBar label="Obj" value={gameScore.objectives} />
        </motion.div>
      </div>

      {/* Middle Row: VS Opponent */}
      {opponent && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-border/40 bg-card/50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">VS Lane Opponent</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{opponent.championName}</span>
                <div className="w-5 h-5 rounded-full overflow-hidden border border-border/50">
                  <Image
                    src={getChampionIconUrl(opponent.championName)}
                    alt={opponent.championName}
                    width={20}
                    height={20}
                    className="object-cover"
                    unoptimized
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="p-3 grid grid-cols-4 gap-3">
            <VsStatBar
              label="Gold"
              you={participant.goldEarned}
              them={opponent.goldEarned}
              format="k"
            />
            <VsStatBar
              label="CS"
              you={cs}
              them={oppCs}
            />
            <VsStatBar
              label="Damage"
              you={participant.totalDamageDealtToChampions}
              them={opponent.totalDamageDealtToChampions}
              format="k"
            />
            <VsStatBar
              label="Vision"
              you={participant.visionScore}
              them={opponent.visionScore}
            />
          </div>
        </motion.div>
      )}

      {/* Bottom Row: Insights */}
      <div className="grid grid-cols-2 gap-3">
        {/* Strengths */}
        <motion.div
          variants={slideLeftVariants}
          className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Strengths</span>
          </div>
          <div className="space-y-1.5">
            {gameScore.insights.length > 0 ? (
              gameScore.insights.slice(0, 4).map((insight, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <TrendingUp className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{insight}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">No notable strengths</div>
            )}
          </div>
        </motion.div>

        {/* To Improve */}
        <motion.div
          variants={slideRightVariants}
          className={cn(
            'rounded-xl border p-3',
            gameScore.improvements.length > 0
              ? 'border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent'
              : 'border-primary/30 bg-gradient-to-br from-primary/10 to-transparent'
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              gameScore.improvements.length > 0 ? 'bg-destructive' : 'bg-primary animate-pulse'
            )} />
            <span className={cn(
              'text-xs font-semibold uppercase tracking-wider',
              gameScore.improvements.length > 0 ? 'text-destructive' : 'text-primary'
            )}>
              {gameScore.improvements.length > 0 ? 'To Improve' : 'Perfect'}
            </span>
          </div>
          <div className="space-y-1.5">
            {gameScore.improvements.length > 0 ? (
              gameScore.improvements.slice(0, 4).map((improvement, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <TrendingDown className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{improvement}</span>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center py-2">
                <span className="text-lg">🏆</span>
                <span className="text-xs text-primary font-medium">Flawless performance</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Extra Stats Row */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-6 gap-2"
      >
        <MicroStat label="CS/min" value={csPerMin.toFixed(1)} good={csPerMin >= 7} />
        <MicroStat label="Gold/min" value={goldPerMin.toFixed(0)} good={goldPerMin >= 400} />
        <MicroStat label="DMG/min" value={(damagePerMin / 1000).toFixed(1) + 'k'} good={damagePerMin >= 800} />
        <MicroStat label="Vision" value={participant.visionScore.toString()} good={participant.visionScore >= minutes * 0.8} />
        <MicroStat label="Solo Kills" value={soloKills.toString()} good={soloKills >= 2} />
        <MicroStat label="Plates" value={turretPlates.toString()} good={turretPlates >= 2} />
      </motion.div>
    </motion.div>
  );
}

// Compact score bar for the analysis tab
function CompactScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full bg-primary"
        />
      </div>
      <span className="text-[10px] font-medium tabular-nums w-6 text-right">{Math.round(value)}</span>
    </div>
  );
}

// VS opponent stat comparison bar
function VsStatBar({ label, you, them, format }: { label: string; you: number; them: number; format?: 'k' }) {
  const total = you + them;
  const youPercent = total > 0 ? (you / total) * 100 : 50;
  const diff = you - them;
  const diffStr = format === 'k'
    ? (diff >= 0 ? '+' : '') + (diff / 1000).toFixed(1) + 'k'
    : (diff >= 0 ? '+' : '') + diff;
  const youStr = format === 'k' ? (you / 1000).toFixed(1) + 'k' : you.toString();
  const themStr = format === 'k' ? (them / 1000).toFixed(1) + 'k' : them.toString();

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          'font-medium',
          diff > 0 ? 'text-primary' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {diffStr}
        </span>
      </div>
      <div className="h-2 bg-muted/20 rounded-full overflow-hidden flex">
        <motion.div
          initial={{ width: '50%' }}
          animate={{ width: `${youPercent}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-l-full bg-primary"
        />
        <motion.div
          initial={{ width: '50%' }}
          animate={{ width: `${100 - youPercent}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-r-full bg-destructive/60"
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums">
        <span className="text-foreground font-medium">{youStr}</span>
        <span className="text-muted-foreground">{themStr}</span>
      </div>
    </div>
  );
}

// Micro stat pill
function MicroStat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border px-2 py-1.5 text-center',
      good ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-card/50'
    )}>
      <div className={cn('text-sm font-bold tabular-nums', good ? 'text-primary' : 'text-foreground')}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

// Types for timeline events
interface ProcessedEvent {
  timestamp: number;
  minute: number;
  type: 'KILL' | 'MULTI_KILL' | 'ACE' | 'DRAGON' | 'BARON' | 'HERALD' | 'TOWER' | 'INHIBITOR' | 'GRUBS';
  teamId: number;
  participantId?: number;
  victimId?: number;
  assistIds?: number[];
  killCount?: number;
  monsterType?: string;
  towerType?: string;
  goldSwing?: number;
}

interface Teamfight {
  timestamp: number;
  minute: number;
  blueKills: number;
  redKills: number;
  events: ProcessedEvent[];
}

// Custom Gold Chart Component - SVG Line Chart
function GoldChart({
  data,
  dataKey,
  title,
  icon,
  color,
  height = 140,
  objectiveMarkers
}: {
  data: { minute: number; teamGoldDiff: number; playerGoldDiff: number }[];
  dataKey: 'teamGoldDiff' | 'playerGoldDiff';
  title: string;
  icon: React.ReactNode;
  color: 'primary' | 'amber';
  height?: number;
  objectiveMarkers?: { minute: number; type: string; isYourTeam: boolean }[];
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const observer = new ResizeObserver((entries) => {
        setContainerWidth(entries[0].contentRect.width);
      });
      observer.observe(node);
      setContainerWidth(node.getBoundingClientRect().width);
      return () => observer.disconnect();
    }
  }, []);

  const colorConfig = {
    primary: { stroke: '#6366f1', text: 'text-primary' },
    amber: { stroke: '#f59e0b', text: 'text-amber-500' }
  };
  const config = colorConfig[color];

  // Calculate domain
  const values = data.map(d => d[dataKey]);
  const maxVal = Math.max(...values.map(Math.abs), 2000);
  const yDomain = Math.ceil(maxVal / 2000) * 2000;
  const minMinute = data.length > 0 ? data[0].minute : 0;
  const maxMinute = data.length > 0 ? data[data.length - 1].minute : 30;

  // Chart dimensions
  const padding = { left: 36, right: 12 };
  const chartWidth = containerWidth - padding.left - padding.right;
  const chartHeight = height;

  // Scale functions
  const xScale = (minute: number) => {
    const range = maxMinute - minMinute || 1;
    return padding.left + ((minute - minMinute) / range) * chartWidth;
  };
  const yScale = (value: number) => {
    return chartHeight / 2 - (value / yDomain) * (chartHeight / 2);
  };

  // Build smooth curve path using cardinal spline
  const buildPath = useMemo(() => {
    if (data.length < 2 || chartWidth <= 0) return { line: '', area: '' };

    const points = data.map(d => ({
      x: xScale(d.minute),
      y: yScale(d[dataKey])
    }));

    // Simple smooth curve using quadratic bezier
    let linePath = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpX = (prev.x + curr.x) / 2;
      linePath += ` Q ${prev.x + (curr.x - prev.x) * 0.5} ${prev.y}, ${cpX} ${(prev.y + curr.y) / 2}`;
      if (i === points.length - 1) {
        linePath += ` T ${curr.x} ${curr.y}`;
      }
    }

    // Simpler line path for reliability
    const simpleLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Area path
    const zeroY = yScale(0);
    const areaPath = simpleLine +
      ` L ${points[points.length - 1].x} ${zeroY}` +
      ` L ${points[0].x} ${zeroY} Z`;

    return { line: simpleLine, area: areaPath };
  }, [data, dataKey, chartWidth, xScale, yScale]);

  // Y-axis labels
  const yLabels = [yDomain, yDomain / 2, 0, -yDomain / 2, -yDomain];

  // X-axis labels
  const xLabels = data.filter((_, i) =>
    i === 0 || i === data.length - 1 || i % Math.max(1, Math.floor(data.length / 5)) === 0
  );

  const finalValue = data.length > 0 ? data[data.length - 1][dataKey] : 0;

  // Handle mouse interaction
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length === 0 || chartWidth <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    const percent = x / chartWidth;
    const index = Math.round(percent * (data.length - 1));
    setHoveredIndex(Math.max(0, Math.min(data.length - 1, index)));
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn('p-1.5 rounded-lg', color === 'primary' ? 'bg-primary/10' : 'bg-amber-500/10')}>
              {icon}
            </div>
            <span className="text-sm font-medium text-foreground">{title}</span>
          </div>

          <div className="flex items-center gap-2">
            {hoveredIndex !== null && data[hoveredIndex] && (
              <span className="text-xs text-muted-foreground">{data[hoveredIndex].minute}m</span>
            )}
            <span className={cn(
              'text-sm font-bold tabular-nums',
              (hoveredIndex !== null ? data[hoveredIndex]?.[dataKey] : finalValue) >= 0
                ? config.text
                : 'text-destructive'
            )}>
              {(() => {
                const val = hoveredIndex !== null ? data[hoveredIndex]?.[dataKey] : finalValue;
                return `${val >= 0 ? '+' : ''}${(val / 1000).toFixed(1)}k`;
              })()}
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="flex">
          {/* Y-axis labels */}
          <div
            className="flex flex-col justify-between text-[10px] text-muted-foreground tabular-nums text-right pr-2"
            style={{ height, width: padding.left - 4 }}
          >
            {yLabels.map((label) => (
              <span key={label} className="leading-none -translate-y-1">
                {label === 0 ? '0' : `${label > 0 ? '+' : ''}${label / 1000}k`}
              </span>
            ))}
          </div>

          {/* SVG Chart */}
          <div ref={containerRef} className="flex-1 relative">
            <svg
              width="100%"
              height={chartHeight}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredIndex(null)}
              className="overflow-visible"
            >
              <defs>
                <linearGradient id={`area-gradient-${dataKey}-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.stroke} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={config.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {yLabels.map((label) => (
                <line
                  key={label}
                  x1={0}
                  x2={chartWidth + padding.left}
                  y1={yScale(label)}
                  y2={yScale(label)}
                  stroke={label === 0 ? 'currentColor' : 'currentColor'}
                  strokeOpacity={label === 0 ? 0.2 : 0.06}
                  strokeDasharray={label === 0 ? '4 4' : undefined}
                  className="text-muted-foreground"
                />
              ))}

              {/* Objective markers */}
              {objectiveMarkers?.map((marker, idx) => (
                <g key={idx}>
                  <line
                    x1={xScale(marker.minute)}
                    x2={xScale(marker.minute)}
                    y1={0}
                    y2={chartHeight}
                    stroke={marker.type === 'BARON' ? '#a855f7' : marker.type === 'DRAGON' ? '#f59e0b' : '#8b5cf6'}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    strokeOpacity={0.4}
                  />
                  <circle
                    cx={xScale(marker.minute)}
                    cy={8}
                    r={4}
                    fill={marker.type === 'BARON' ? '#a855f7' : marker.type === 'DRAGON' ? '#f59e0b' : '#8b5cf6'}
                  />
                </g>
              ))}

              {/* Area fill */}
              {buildPath.area && (
                <motion.path
                  d={buildPath.area}
                  fill={`url(#area-gradient-${dataKey}-${color})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                />
              )}

              {/* Line */}
              {buildPath.line && (
                <motion.path
                  d={buildPath.line}
                  fill="none"
                  stroke={config.stroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              )}

              {/* Hover elements */}
              {hoveredIndex !== null && data[hoveredIndex] && chartWidth > 0 && (
                <g>
                  {/* Vertical line */}
                  <line
                    x1={xScale(data[hoveredIndex].minute)}
                    x2={xScale(data[hoveredIndex].minute)}
                    y1={0}
                    y2={chartHeight}
                    stroke={config.stroke}
                    strokeWidth={1}
                    strokeOpacity={0.3}
                    strokeDasharray="4 4"
                  />
                  {/* Dot */}
                  <circle
                    cx={xScale(data[hoveredIndex].minute)}
                    cy={yScale(data[hoveredIndex][dataKey])}
                    r={5}
                    fill={config.stroke}
                    stroke="white"
                    strokeWidth={2}
                  />
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground" style={{ marginLeft: padding.left }}>
          {xLabels.map((d) => (
            <span key={d.minute}>{d.minute}m</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Gold Graph Tab Component
function GoldGraphTab({
  timelineData,
  loading,
  error,
  allParticipants,
  currentPuuid,
  playerTeamId,
  events,
  teamfights,
  participant,
  gameDuration,
  isWin
}: {
  timelineData: TimelineFrame[] | null;
  loading: boolean;
  error: string | null;
  allParticipants: Participant[];
  currentPuuid: string;
  playerTeamId: number;
  events?: ProcessedEvent[];
  teamfights?: Teamfight[];
  participant: Participant;
  gameDuration: number;
  isWin: boolean;
}) {
  // Process timeline data for the chart
  const chartData = useMemo(() => {
    if (!timelineData || timelineData.length === 0) return [];

    // Get participant IDs for each team
    const blueTeamIds = allParticipants
      .filter(p => p.teamId === 100)
      .map(p => p.participantId);

    // Find current player's participant ID
    const currentPlayer = allParticipants.find(p => p.puuid === currentPuuid);
    const currentPlayerId = currentPlayer?.participantId;

    // Find opponent (same position on enemy team)
    const currentPosition = currentPlayer?.teamPosition || currentPlayer?.individualPosition;
    const opponent = allParticipants.find(p =>
      p.teamId !== playerTeamId &&
      (p.teamPosition === currentPosition || p.individualPosition === currentPosition)
    );
    const opponentId = opponent?.participantId;

    // Process each frame
    return timelineData.map((frame) => {
      const minute = Math.round(frame.timestamp / 60000);

      // Calculate team gold totals
      let blueGold = 0;
      let redGold = 0;
      let playerGold = 0;
      let opponentGold = 0;

      Object.entries(frame.participantFrames).forEach(([id, pf]) => {
        const participantId = parseInt(id);
        if (blueTeamIds.includes(participantId)) {
          blueGold += pf.totalGold;
        } else {
          redGold += pf.totalGold;
        }

        if (participantId === currentPlayerId) {
          playerGold = pf.totalGold;
        }
        if (participantId === opponentId) {
          opponentGold = pf.totalGold;
        }
      });

      const teamGoldDiff = playerTeamId === 100 ? blueGold - redGold : redGold - blueGold;
      const playerGoldDiff = playerGold - opponentGold;

      return {
        minute,
        teamGoldDiff,
        playerGoldDiff,
        blueGold,
        redGold,
        timestamp: frame.timestamp
      };
    });
  }, [timelineData, allParticipants, currentPuuid, playerTeamId]);

  // Get player and opponent IDs for solo kill detection
  const { currentPlayerId, opponentId, opponentChampion } = useMemo(() => {
    const currentPlayer = allParticipants.find(p => p.puuid === currentPuuid);
    const currentPosition = currentPlayer?.teamPosition || currentPlayer?.individualPosition;
    const opponent = allParticipants.find(p =>
      p.teamId !== playerTeamId &&
      (p.teamPosition === currentPosition || p.individualPosition === currentPosition)
    );
    return {
      currentPlayerId: currentPlayer?.participantId,
      opponentId: opponent?.participantId,
      opponentChampion: opponent?.championName || 'opponent'
    };
  }, [allParticipants, currentPuuid, playerTeamId]);

  // Build key moments from teamfights, events, and solo kills
  const keyMoments = useMemo(() => {
    if (!teamfights && !events) {
      // Fallback to old method if no events
      if (chartData.length < 3) return [];

      const moments: { minute: number; change: number; description: string; type: string; isPositive: boolean; details?: string }[] = [];

      for (let i = 1; i < chartData.length; i++) {
        const prevDiff = chartData[i - 1].teamGoldDiff;
        const currDiff = chartData[i].teamGoldDiff;
        const change = currDiff - prevDiff;

        if (Math.abs(change) > 1500) {
          moments.push({
            minute: chartData[i].minute,
            change,
            description: change > 0 ? 'Gold swing in your favor' : 'Gold swing against you',
            type: 'SWING',
            isPositive: change > 0
          });
        }
      }
      return moments.slice(0, 5);
    }

    const moments: { minute: number; change: number; description: string; type: string; isPositive: boolean; details?: string }[] = [];

    // Helper to get champion name by participant ID
    const getChampionName = (participantId: number | undefined) => {
      if (!participantId) return 'Unknown';
      const participant = allParticipants.find(p => p.participantId === participantId);
      return participant?.championName || 'Unknown';
    };

    // Detect kills involving the player
    if (events && currentPlayerId) {
      const playerKills = events.filter(e => {
        if (e.type !== 'KILL') return false;
        return e.participantId === currentPlayerId || e.victimId === currentPlayerId;
      });

      for (const kill of playerKills) {
        const isPlayerKill = kill.participantId === currentPlayerId;
        const isSoloKill = !kill.assistIds || kill.assistIds.length === 0;
        const isVsLaneOpponent = (isPlayerKill && kill.victimId === opponentId) ||
                                  (!isPlayerKill && kill.participantId === opponentId);

        // Get champion names for context
        const victimChamp = getChampionName(kill.victimId);
        const killerChamp = getChampionName(kill.participantId);

        let description = '';
        if (isPlayerKill) {
          description = isSoloKill ? `Solo killed ${victimChamp}` : `Killed ${victimChamp}`;
        } else {
          description = `Killed by ${killerChamp}`;
        }

        moments.push({
          minute: kill.minute,
          change: isPlayerKill ? (kill.goldSwing || 300) : -(kill.goldSwing || 300),
          description,
          type: isSoloKill && isVsLaneOpponent ? 'SOLO_KILL' : 'KILL',
          isPositive: isPlayerKill
        });
      }
    }

    // Add teamfights
    if (teamfights) {
      for (const tf of teamfights) {
        const yourTeamKills = playerTeamId === 100 ? tf.blueKills : tf.redKills;
        const enemyKills = playerTeamId === 100 ? tf.redKills : tf.blueKills;
        const isWon = yourTeamKills > enemyKills;
        const goldChange = (yourTeamKills - enemyKills) * 450; // Approximate gold per kill

        moments.push({
          minute: tf.minute,
          change: goldChange,
          description: isWon
            ? `Teamfight won ${yourTeamKills}-${enemyKills}`
            : `Teamfight lost ${yourTeamKills}-${enemyKills}`,
          type: 'TEAMFIGHT',
          isPositive: isWon,
          details: `${yourTeamKills + enemyKills} total kills`
        });
      }
    }

    // Add major objectives (deduplicated)
    if (events) {
      const majorEvents = events.filter(e =>
        e.type === 'BARON' || e.type === 'DRAGON' || e.type === 'HERALD'
      );

      // Deduplicate by minute + type + teamId
      const seenEvents = new Set<string>();

      for (const event of majorEvents) {
        const eventKey = `${event.minute}-${event.type}-${event.teamId}`;
        if (seenEvents.has(eventKey)) continue;
        seenEvents.add(eventKey);

        const isYourTeam = event.teamId === playerTeamId;
        let description = '';

        if (event.type === 'BARON') {
          description = isYourTeam ? 'Baron secured' : 'Enemy took Baron';
        } else if (event.type === 'DRAGON') {
          const dragonType = event.monsterType?.replace('_DRAGON', '') || 'Dragon';
          description = isYourTeam ? `${dragonType} drake` : `Enemy ${dragonType} drake`;
        } else if (event.type === 'HERALD') {
          description = isYourTeam ? 'Herald secured' : 'Enemy took Herald';
        }

        moments.push({
          minute: event.minute,
          change: isYourTeam ? (event.goldSwing || 500) : -(event.goldSwing || 500),
          description,
          type: event.type,
          isPositive: isYourTeam
        });
      }
    }

    // Deduplicate by minute (keep most important event per minute)
    const deduped = new Map<number, typeof moments[0]>();
    for (const m of moments) {
      const existing = deduped.get(m.minute);
      if (!existing) {
        deduped.set(m.minute, m);
      } else {
        // Prioritize: objectives > teamfights > solo kills > kills
        const priority = (type: string) => {
          if (type === 'BARON' || type === 'DRAGON' || type === 'HERALD') return 4;
          if (type === 'TEAMFIGHT') return 3;
          if (type === 'SOLO_KILL') return 2;
          return 1;
        };
        if (priority(m.type) > priority(existing.type)) {
          deduped.set(m.minute, m);
        }
      }
    }

    // Sort by minute and return all events
    return Array.from(deduped.values()).sort((a, b) => a.minute - b.minute);
  }, [chartData, teamfights, events, playerTeamId, currentPlayerId, opponentId, opponentChampion, allParticipants]);

  // Find objective events for markers (deduplicated)
  const objectiveMarkers = useMemo(() => {
    if (!events) return [];

    const seen = new Set<string>();
    return events
      .filter(e => e.type === 'BARON' || e.type === 'DRAGON' || e.type === 'HERALD')
      .filter(e => {
        const key = `${e.minute}-${e.type}-${e.teamId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(e => ({
        minute: e.minute,
        type: e.type,
        isYourTeam: e.teamId === playerTeamId
      }));
  }, [events, playerTeamId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <Loader2 className="h-10 w-10 animate-spin text-primary relative" />
        </div>
        <span className="text-sm text-muted-foreground mt-4">Loading gold data...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="p-4 rounded-full bg-destructive/10 mb-3">
          <Activity className="h-8 w-8 text-destructive" />
        </div>
        <span className="text-destructive text-sm font-medium">{error}</span>
        <span className="text-xs text-muted-foreground mt-1">Timeline may not be available for older matches</span>
      </div>
    );
  }

  // No data yet
  if (!timelineData || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="p-4 rounded-full bg-muted/20 mb-3">
          <LineChart className="h-8 w-8 text-muted-foreground" />
        </div>
        <span className="text-sm text-muted-foreground">No timeline data available</span>
      </div>
    );
  }

  // Generate game timeline story - narrative of key moments
  const gameStory = useMemo(() => {
    if (chartData.length < 5) return null;

    const gameDurationMin = Math.floor(gameDuration / 60);

    // Get gold data at key timestamps
    const at5 = chartData.find(d => d.minute === 5) || chartData[Math.min(5, chartData.length - 1)];
    const at10 = chartData.find(d => d.minute === 10) || chartData[Math.min(10, chartData.length - 1)];
    const at15 = chartData.find(d => d.minute === 15) || chartData[Math.min(15, chartData.length - 1)];
    const at20 = chartData.find(d => d.minute === 20) || chartData[Math.min(20, chartData.length - 1)];
    const finalData = chartData[chartData.length - 1];

    // Team gold differences
    const teamAt10 = at10?.teamGoldDiff || 0;
    const teamAt15 = at15?.teamGoldDiff || 0;
    const teamAt20 = at20?.teamGoldDiff || 0;
    const teamFinal = finalData?.teamGoldDiff || 0;

    // Player gold differences
    const playerAt10 = at10?.playerGoldDiff || 0;
    const playerFinal = finalData?.playerGoldDiff || 0;

    // Find gold swings (moments where gold changed significantly)
    const swings: { minute: number; before: number; after: number; change: number }[] = [];
    for (let i = 1; i < chartData.length; i++) {
      const prev = chartData[i - 1].teamGoldDiff;
      const curr = chartData[i].teamGoldDiff;
      const change = curr - prev;
      if (Math.abs(change) >= 1500) {
        swings.push({
          minute: chartData[i].minute,
          before: prev,
          after: curr,
          change
        });
      }
    }

    // Find the biggest swing / turning point
    const biggestSwing = swings.reduce((max, s) =>
      Math.abs(s.change) > Math.abs(max?.change || 0) ? s : max
    , swings[0]);

    // Detect if there was a comeback
    const wasLosingEarly = teamAt10 < -2000;
    const wasWinningEarly = teamAt10 > 2000;
    const wonGame = isWin;
    const hadComeback = wasLosingEarly && wonGame;
    const threwLead = wasWinningEarly && !wonGame;

    // Find max lead/deficit
    let maxLead = 0;
    let maxDeficit = 0;
    let maxLeadMin = 0;
    let maxDeficitMin = 0;
    for (const d of chartData) {
      if (d.teamGoldDiff > maxLead) {
        maxLead = d.teamGoldDiff;
        maxLeadMin = d.minute;
      }
      if (d.teamGoldDiff < maxDeficit) {
        maxDeficit = d.teamGoldDiff;
        maxDeficitMin = d.minute;
      }
    }

    // Build narrative chapters
    type Chapter = {
      time: string;
      title: string;
      description: string;
      type: 'positive' | 'negative' | 'neutral' | 'turning_point';
      goldChange?: string;
    };

    const chapters: Chapter[] = [];

    // Chapter 1: Early game (0-10)
    if (teamAt10 >= 2500) {
      chapters.push({
        time: '0-10 min',
        title: 'Early Domination',
        description: `Your team crushed early game with a ${(teamAt10/1000).toFixed(1)}k gold lead.`,
        type: 'positive',
        goldChange: `+${teamAt10}g`
      });
    } else if (teamAt10 <= -2500) {
      chapters.push({
        time: '0-10 min',
        title: 'Rough Start',
        description: `Early game went poorly. Your team was ${(Math.abs(teamAt10)/1000).toFixed(1)}k behind.`,
        type: 'negative',
        goldChange: `${teamAt10}g`
      });
    } else if (Math.abs(teamAt10) < 1000) {
      chapters.push({
        time: '0-10 min',
        title: 'Even Early',
        description: 'Both teams traded evenly in early game.',
        type: 'neutral'
      });
    }

    // Chapter 2: Major events from keyMoments
    const objectiveEvents = keyMoments.filter(m =>
      m.type === 'BARON' || m.type === 'DRAGON' || m.type === 'HERALD'
    );
    const teamfightEvents = keyMoments.filter(m => m.type === 'TEAMFIGHT');

    // Add significant teamfights
    const bigTeamfights = teamfightEvents.filter(tf => Math.abs(tf.change) >= 1500);
    for (const tf of bigTeamfights.slice(0, 2)) {
      chapters.push({
        time: `@${tf.minute} min`,
        title: tf.isPositive ? 'Teamfight Won' : 'Teamfight Lost',
        description: tf.description,
        type: tf.isPositive ? 'positive' : 'negative',
        goldChange: tf.isPositive ? `+${Math.abs(tf.change)}g` : `-${Math.abs(tf.change)}g`
      });
    }

    // Add baron if it happened
    const baronEvent = objectiveEvents.find(e => e.type === 'BARON');
    if (baronEvent) {
      chapters.push({
        time: `@${baronEvent.minute} min`,
        title: baronEvent.isPositive ? 'Baron Secured' : 'Baron Lost',
        description: baronEvent.isPositive
          ? 'Your team secured Baron and gained map control.'
          : 'Enemy team took Baron, putting pressure on your base.',
        type: baronEvent.isPositive ? 'positive' : 'negative'
      });
    }

    // Chapter: Turning point (if significant swing)
    if (biggestSwing && Math.abs(biggestSwing.change) >= 2500) {
      const wasPositive = biggestSwing.change > 0;
      chapters.push({
        time: `@${biggestSwing.minute} min`,
        title: 'Turning Point',
        description: wasPositive
          ? `A ${(biggestSwing.change/1000).toFixed(1)}k gold swing shifted momentum in your favor.`
          : `A ${(Math.abs(biggestSwing.change)/1000).toFixed(1)}k gold swing gave the enemy team control.`,
        type: 'turning_point',
        goldChange: wasPositive ? `+${biggestSwing.change}g` : `${biggestSwing.change}g`
      });
    }

    // Sort chapters by time
    chapters.sort((a, b) => {
      const getMinute = (time: string) => {
        if (time.includes('@')) return parseInt(time.replace(/[^0-9]/g, ''));
        if (time.includes('-')) return parseInt(time.split('-')[0]);
        return 0;
      };
      return getMinute(a.time) - getMinute(b.time);
    });

    // Build verdict
    let verdict = '';
    let verdictType: 'positive' | 'negative' | 'neutral' = 'neutral';
    let keyFactor = '';

    if (hadComeback) {
      verdict = 'Comeback Victory';
      verdictType = 'positive';
      keyFactor = `Your team was ${(Math.abs(maxDeficit)/1000).toFixed(1)}k behind at ${maxDeficitMin} min but turned it around.`;
    } else if (threwLead) {
      verdict = 'Thrown Lead';
      verdictType = 'negative';
      keyFactor = `Your team had a ${(maxLead/1000).toFixed(1)}k lead at ${maxLeadMin} min but couldn't close it out.`;
    } else if (isWin && maxLead >= 5000) {
      verdict = 'Dominant Win';
      verdictType = 'positive';
      keyFactor = `Your team controlled the game from start to finish.`;
    } else if (!isWin && maxDeficit <= -5000) {
      verdict = 'Outclassed';
      verdictType = 'negative';
      keyFactor = `The enemy team had too much momentum to overcome.`;
    } else if (isWin) {
      verdict = 'Hard-Fought Win';
      verdictType = 'positive';
      keyFactor = 'Close game decided by late game execution.';
    } else {
      verdict = 'Close Loss';
      verdictType = 'negative';
      keyFactor = 'Small mistakes added up in a tight game.';
    }

    // Your role in the outcome
    let yourRole = '';
    const youWonLane = playerAt10 >= 500;
    const youLostLane = playerAt10 <= -500;
    const youEndedAhead = playerFinal >= 0;

    if (youWonLane && !youEndedAhead && !isWin) {
      yourRole = 'You won lane but couldn\'t carry the advantage into mid-game.';
    } else if (youLostLane && isWin) {
      yourRole = 'You fell behind early but your team carried the game.';
    } else if (youWonLane && isWin) {
      yourRole = 'You won lane and helped snowball the game.';
    } else if (youLostLane && !isWin) {
      yourRole = 'Falling behind in lane made the game harder to win.';
    }

    return {
      chapters: chapters.slice(0, 5),
      verdict,
      verdictType,
      keyFactor,
      yourRole,
      stats: {
        maxLead: maxLead > 0 ? `+${(maxLead/1000).toFixed(1)}k @${maxLeadMin}min` : null,
        maxDeficit: maxDeficit < 0 ? `${(maxDeficit/1000).toFixed(1)}k @${maxDeficitMin}min` : null,
        goldSwings: swings.length,
        gameDuration: `${gameDurationMin}min`
      }
    };
  }, [chartData, keyMoments, gameDuration, isWin]);

  return (
    <div className="space-y-4">
      <GoldGraph
        chartData={chartData}
        objectiveMarkers={objectiveMarkers}
        teamfights={teamfights || undefined}
        keyMoments={keyMoments}
        playerTeamId={playerTeamId}
      />

      {/* Game Story Section */}
      {gameStory && gameStory.chapters.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4"
        >
          {/* Header with verdict */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'px-3 py-1 rounded-full text-xs font-bold',
                gameStory.verdictType === 'positive'
                  ? 'bg-primary/20 text-primary'
                  : gameStory.verdictType === 'negative'
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted text-muted-foreground'
              )}>
                {gameStory.verdict}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              {gameStory.stats.maxLead && <span>Peak: {gameStory.stats.maxLead}</span>}
              {gameStory.stats.maxDeficit && <span>Low: {gameStory.stats.maxDeficit}</span>}
              <span>{gameStory.stats.goldSwings} swings</span>
            </div>
          </div>

          {/* Key factor */}
          <p className="text-sm text-muted-foreground">{gameStory.keyFactor}</p>

          {/* Timeline chapters */}
          <div className="relative pl-4 border-l-2 border-border/50 space-y-3">
            {gameStory.chapters.map((chapter, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * idx }}
                className="relative"
              >
                {/* Timeline dot */}
                <div className={cn(
                  'absolute -left-[21px] w-3 h-3 rounded-full border-2 border-background',
                  chapter.type === 'positive' ? 'bg-primary' :
                  chapter.type === 'negative' ? 'bg-destructive' :
                  chapter.type === 'turning_point' ? 'bg-amber-500' : 'bg-muted-foreground'
                )} />

                <div className={cn(
                  'p-3 rounded-lg border ml-2',
                  chapter.type === 'positive' ? 'bg-primary/5 border-primary/20' :
                  chapter.type === 'negative' ? 'bg-destructive/5 border-destructive/20' :
                  chapter.type === 'turning_point' ? 'bg-amber-500/5 border-amber-500/20' :
                  'bg-muted/20 border-border/30'
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      'text-xs font-semibold',
                      chapter.type === 'positive' ? 'text-primary' :
                      chapter.type === 'negative' ? 'text-destructive' :
                      chapter.type === 'turning_point' ? 'text-amber-500' : 'text-foreground'
                    )}>
                      {chapter.title}
                    </span>
                    <div className="flex items-center gap-2">
                      {chapter.goldChange && (
                        <span className={cn(
                          'text-[10px] font-mono',
                          chapter.goldChange.startsWith('+') ? 'text-primary' : 'text-destructive'
                        )}>
                          {chapter.goldChange}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{chapter.time}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{chapter.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Your role */}
          {gameStory.yourRole && (
            <div className="pt-2 border-t border-border/30">
              <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                Your Impact
              </p>
              <p className="text-xs text-foreground">{gameStory.yourRole}</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function GameStatRing({
  label,
  value,
  max,
  suffix = '',
  isGood
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  isGood: boolean;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const circumference = 2 * Math.PI * 28;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const goodColors = { start: '#818cf8', end: '#6366f1' };
  const badColors = { start: '#f87171', end: '#dc2626' };
  const colors = isGood ? goodColors : badColors;
  const uniqueId = `game-gradient-${label.replace(/\s+/g, '-').toLowerCase()}-${isGood ? 'good' : 'bad'}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <defs>
            <linearGradient id={uniqueId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>
          </defs>
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
            className="text-muted/30"
          />
          <motion.circle
            cx="32"
            cy="32"
            r="28"
            stroke={`url(#${uniqueId})`}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ strokeDasharray: circumference }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-sm font-bold', isGood ? 'text-primary' : 'text-destructive')}>
            {value.toFixed(value < 10 ? 1 : 0)}{suffix}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground mt-1">{label}</span>
    </div>
  );
}

function ScoreBar({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function MiniStatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-background/50 rounded-lg p-2.5 text-center border border-border/30">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function PlayerRow({
  player,
  region,
  gameDuration,
  isCurrentPlayer,
  maxDamage
}: {
  player: Participant;
  region: string;
  gameDuration: number;
  isCurrentPlayer: boolean;
  maxDamage: number;
}) {
  const cs = player.totalMinionsKilled + player.neutralMinionsKilled;
  const csPerMin = (cs / (gameDuration / 60)).toFixed(1);
  const kda = player.deaths === 0
    ? 'Perfect'
    : ((player.kills + player.assists) / player.deaths).toFixed(2);
  const damagePercent = (player.totalDamageDealtToChampions / maxDamage) * 100;

  const items = [player.item0, player.item1, player.item2, player.item3, player.item4, player.item5];
  const trinket = player.item6;

  // Build profile URL
  const gameName = player.riotIdGameName || player.summonerName;
  const tagLine = player.riotIdTagline || 'EUW';
  const profileUrl = `/${region}/${encodeURIComponent(`${gameName}-${tagLine}`)}`;

  return (
    <div className={cn(
      'flex items-center gap-2 p-2 rounded-lg text-xs',
      isCurrentPlayer ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/30'
    )}>
      {/* Champion */}
      <Image
        src={getChampionIconUrl(player.championName)}
        alt={player.championName}
        width={32}
        height={32}
        className="rounded-lg flex-shrink-0"
        unoptimized
      />

      {/* Spells */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <Image
          src={getSummonerSpellIconUrl(player.summoner1Id)}
          alt="Spell"
          width={14}
          height={14}
          className="rounded"
          unoptimized
        />
        <Image
          src={getSummonerSpellIconUrl(player.summoner2Id)}
          alt="Spell"
          width={14}
          height={14}
          className="rounded"
          unoptimized
        />
      </div>

      {/* Name - clickable link */}
      <div className="min-w-0 w-24 flex-shrink-0">
        <Link
          href={profileUrl}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'font-medium truncate block hover:underline',
            isCurrentPlayer ? 'text-primary' : 'hover:text-primary'
          )}
        >
          {gameName}
        </Link>
      </div>

      {/* KDA */}
      <div className="w-20 flex-shrink-0 text-center">
        <span className="font-medium">
          {player.kills}/{player.deaths}/{player.assists}
        </span>
        <div className={cn(
          'text-[10px]',
          parseFloat(kda) >= 3 ? 'text-primary' : 'text-muted-foreground'
        )}>
          {kda} KDA
        </div>
      </div>

      {/* Damage bar */}
      <div className="flex-1 min-w-0 hidden md:block">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary/60 rounded-full origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: 0.6,
                ease: [0.25, 0.46, 0.45, 0.94],
                delay: 0.15
              }}
              style={{ width: `${damagePercent}%` }}
            />
          </div>
          <motion.span
            className="text-[10px] text-muted-foreground w-12 text-right tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            {(player.totalDamageDealtToChampions / 1000).toFixed(1)}k
          </motion.span>
        </div>
      </div>

      {/* CS */}
      <div className="w-14 flex-shrink-0 text-center hidden sm:block">
        <div className="font-medium">{cs}</div>
        <div className="text-[10px] text-muted-foreground">{csPerMin}/m</div>
      </div>

      {/* Gold */}
      <div className="w-14 flex-shrink-0 text-center hidden lg:block">
        <div className="font-medium flex items-center justify-center gap-1">
          <Coins className="h-3 w-3 text-yellow-500" />
          {(player.goldEarned / 1000).toFixed(1)}k
        </div>
      </div>

      {/* Items */}
      <div className="hidden xl:flex gap-0.5 flex-shrink-0">
        {items.map((itemId, idx) => (
          <ItemSlot key={idx} itemId={itemId} size={20} />
        ))}
        <ItemSlot itemId={trinket} size={20} isTrinket />
      </div>
    </div>
  );
}

function ItemSlot({ itemId, isTrinket = false, size = 28 }: { itemId: number; isTrinket?: boolean; size?: number }) {
  if (!itemId) {
    return (
      <div
        className={cn(
          'rounded bg-muted/20 border border-border/30',
          isTrinket && 'rounded-full'
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <Image
      src={getItemIconUrl(itemId)}
      alt={`Item ${itemId}`}
      width={size}
      height={size}
      className={cn('rounded border border-border/20', isTrinket && 'rounded-full')}
      unoptimized
    />
  );
}

function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
