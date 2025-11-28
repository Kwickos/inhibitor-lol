'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Sword, Eye, ChevronDown, Target, Coins, TrendingUp, TrendingDown, Minus, Zap, Shield, Crosshair, Activity, Award } from 'lucide-react';
import { getChampionIconUrl, getItemIconUrl, getSummonerSpellIconUrl } from '@/lib/riot-api';
import { TowerIcon, DragonIcon, BaronIcon, HeraldIcon, GrubsIcon, AtakhanIcon } from '@/components/icons/objective-icons';
import { getQueueInfo } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';
import type { MatchSummary, Participant } from '@/types/riot';

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
  teamObjectives?: MatchSummary['teams'][0]
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

  if (opponent) {
    const oppCs = opponent.totalMinionsKilled + opponent.neutralMinionsKilled;
    goldDiff = participant.goldEarned - opponent.goldEarned;
    csDiff = cs - oppCs;
    xpDiff = participant.champExperience - opponent.champExperience;
    visionDiff = participant.visionScore - opponent.visionScore;
  }

  // ===== COMBAT SCORE (0-100) =====
  const kda = participant.deaths === 0
    ? (participant.kills + participant.assists) * 1.5
    : (participant.kills + participant.assists) / participant.deaths;
  const kdaScore = Math.min(100, kda * 12);

  // KP score - role adjusted
  const kpTarget = isSupport || isJungler ? 70 : 55;
  const kpScore = Math.min(100, (killParticipation / kpTarget) * 100);

  // Damage share score - role adjusted
  const dmgTarget = isSupport ? 10 : isADC || isMid ? 28 : 20;
  const dmgScore = isSupport
    ? Math.min(100, 70 + damageShareTeam * 2) // Supports get baseline + small bonus
    : Math.min(100, (damageShareTeam / dmgTarget) * 100);

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

  // CS expectations by role
  const csTarget = isSupport ? 1.5 : isJungler ? 5.5 : isTop ? 7.5 : 8.5;
  const csScore = Math.min(100, (csPerMin / csTarget) * 100);

  // Jungler-specific: jungle camps efficiency
  const jungleCampsTarget = 5.0; // Good junglers should clear ~5 camps/min
  const jungleCampsScore = isJungler ? Math.min(100, (jungleCampsPerMin / jungleCampsTarget) * 100) : 0;

  // Gold efficiency
  const goldTarget = isSupport ? 320 : isJungler ? 400 : 480;
  const goldScore = Math.min(100, (goldPerMin / goldTarget) * 100);

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
  // Vision expectations by role
  const visionTarget = isSupport ? 2.2 : isJungler ? 1.0 : 0.7;
  const visionScoreBase = Math.min(100, (visionPerMin / visionTarget) * 100);

  // Control wards bought bonus
  const controlWardsBought = participant.visionWardsBoughtInGame || 0;
  const controlWardBonus = Math.min(15, controlWardsBought * 4);

  // Wards placed bonus (especially for supports)
  const wardsPlaced = participant.wardsPlaced || 0;
  const wardsPlacedPerMin = wardsPlaced / minutes;
  const wardsPlacedTarget = isSupport ? 1.5 : isJungler ? 0.6 : 0.4;
  const wardsPlacedBonus = Math.min(10, (wardsPlacedPerMin / wardsPlacedTarget) * 10);

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
  if (kda >= 6) insights.push('Outstanding KDA');
  else if (kda >= 4) insights.push('Excellent KDA');
  else if (kda >= 2.5) insights.push('Solid KDA');

  if (participant.deaths > 7) improvements.push('Too many deaths - play safer');
  else if (participant.deaths > 5) improvements.push('Reduce deaths - watch positioning');

  // --- Kill Participation ---
  const kpGood = isSupport || isJungler ? 65 : 50;
  const kpGreat = isSupport || isJungler ? 75 : 65;
  const kpBad = isSupport || isJungler ? 50 : 35;

  if (killParticipation >= kpGreat) insights.push('Excellent kill participation');
  else if (killParticipation >= kpGood) insights.push('Good team presence');

  if (killParticipation < kpBad) {
    improvements.push(isSupport ? 'Stay with your team more' : isJungler ? 'Gank more often' : 'Join more fights');
  }

  // --- VS Opponent ---
  if (opponent) {
    if (goldDiff > 2000) insights.push(`Dominated lane (+${Math.round(goldDiff)} gold)`);
    else if (goldDiff > 800) insights.push('Won lane in gold');
    else if (goldDiff < -2000) improvements.push('Lost lane hard - focus on fundamentals');
    else if (goldDiff < -800) improvements.push('Fell behind in lane');

    if (!isSupport && !isJungler) {
      if (csDiff > 30) insights.push(`CS lead vs opponent (+${csDiff})`);
      else if (csDiff < -30) improvements.push('Improve last hitting vs opponent');
    }

    if (xpDiff > 1000) insights.push('Strong XP advantage');
    else if (xpDiff < -1500) improvements.push('Fell behind in XP');
  }

  // --- Damage ---
  if (!isSupport) {
    if (damageShareTeam >= 30) insights.push('Carried damage for team');
    else if (damageShareTeam >= 25) insights.push('High damage output');

    if (damageShareTeam < 12 && (isADC || isMid)) {
      improvements.push('Deal more damage - position better in fights');
    } else if (damageShareTeam < 15 && isTop) {
      improvements.push('Be more impactful in teamfights');
    }
  } else {
    // Support-specific metrics
    if (participant.totalHealsOnTeammates > 8000) insights.push('Massive healing output');
    else if (participant.totalHealsOnTeammates > 5000) insights.push('Great heals');
    if (participant.totalDamageShieldedOnTeammates > 5000) insights.push('Strong shields');

    // CC time for supports
    if (ccTimePerMin >= 8) insights.push('Excellent CC presence');
    else if (ccTimePerMin >= 5) insights.push('Good crowd control');
    else if (ccTimePerMin < 3 && minutes > 15) improvements.push('Land more CC abilities');

    // Assist ratio for supports
    if (assistRatio >= 60) insights.push('Involved in most kills');
    else if (assistRatio < 35) improvements.push('Stay closer to carries');
  }

  // --- Farming ---
  if (!isSupport) {
    if (isJungler) {
      // Jungler-specific farming insights
      if (jungleCampsPerMin >= 5) insights.push('Excellent clear speed');
      else if (jungleCampsPerMin >= 4) insights.push('Good jungle efficiency');
      else if (jungleCampsPerMin < 3.5) improvements.push('Clear camps faster');

      // Jungler vs enemy jungler
      if (jungleGoldDiff > 1500) insights.push('Outfarmed enemy jungler');
      else if (jungleGoldDiff < -1500) improvements.push('Fell behind enemy jungler');
    } else {
      const csGreat = isTop ? 7 : 8;
      const csBad = isTop ? 5 : 5.5;

      if (csPerMin >= csGreat) insights.push('Great farming');
      if (csPerMin < csBad) improvements.push('Improve CS/min');
    }
  }

  // --- Vision ---
  const visionGreat = isSupport ? 2.0 : isJungler ? 0.9 : 0.7;
  const visionBad = isSupport ? 1.2 : isJungler ? 0.5 : 0.4;

  if (visionPerMin >= visionGreat) insights.push(isSupport ? 'Excellent vision control' : 'Great warding');
  if (visionPerMin < visionBad) {
    improvements.push(isSupport ? 'Ward more - vision is crucial' : 'Buy more control wards');
  }

  // Control wards
  if (controlWardsBought >= 5) insights.push('Great control ward usage');
  else if (controlWardsBought >= 3) insights.push('Good control ward usage');
  else if (controlWardsBought <= 1 && minutes > 20) {
    improvements.push('Buy control wards');
  }

  // Wards placed (especially for supports)
  if (isSupport) {
    if (wardsPlaced >= 25) insights.push(`${wardsPlaced} wards placed`);
    else if (wardsPlaced < 15 && minutes > 20) improvements.push('Place more wards');
  }

  // Wards killed (vision denial)
  if (wardsKilled >= 8) insights.push('Great vision denial');
  else if (wardsKilled >= 5) insights.push('Good ward clearing');
  else if (isSupport && wardsKilled < 3 && minutes > 20) {
    improvements.push('Clear more enemy wards');
  }

  // --- Objectives ---
  if (epicSteals > 0) insights.push(`Epic steal${epicSteals > 1 ? 's' : ''}! (${epicSteals})`);
  if (participant.firstBloodKill) insights.push('First blood');
  if (participant.firstTowerKill) insights.push('First tower');

  if (turretKills >= 3) insights.push('Tower destroyer');
  else if (isTop && turretDamage < 2000 && minutes > 20) {
    improvements.push('Push for tower damage');
  }

  if (isJungler) {
    if (personalDragons >= 3) insights.push('Dragon control');
    else if (personalDragons === 0 && minutes > 25) {
      improvements.push('Prioritize dragon');
    }
    if (personalBarons >= 1) insights.push('Secured baron');

    // Objective damage for junglers
    if (objectiveDamage > 25000) insights.push('High objective damage');
    else if (objectiveDamage < 10000 && minutes > 20) {
      improvements.push('Deal more damage to objectives');
    }
  }

  // --- Tank duty ---
  if ((isTop || isSupport) && damageTakenShare >= 30) {
    insights.push('Strong frontline presence');
  }

  // --- Multi-kills ---
  if (participant.pentaKills > 0) insights.push('PENTAKILL!');
  else if (participant.quadraKills > 0) insights.push('Quadra kill!');
  else if (participant.tripleKills > 0) insights.push('Triple kill');

  // --- Clean game ---
  if (isWin && participant.deaths <= 1) insights.push('Nearly flawless game');
  else if (isWin && participant.deaths <= 3 && kda >= 4) insights.push('Clean performance');

  // --- Fallback if no insights ---
  if (insights.length === 0) {
    if (isWin) {
      insights.push('Contributed to the win');
    } else {
      insights.push('Tough game - keep practicing!');
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
}

export function MatchCard({ match, currentPuuid, region, delay = 0 }: MatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis'>('overview');
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

  // Calculate game score
  const gameScore = useMemo(() => {
    if (!match.allParticipants) return null;
    const teamObjectives = match.teams?.find(t => t.teamId === participant.teamId);
    return calculateGameScore(
      participant,
      match.allParticipants,
      match.gameDuration,
      match.win,
      teamObjectives
    );
  }, [match, participant]);

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

        {/* Game Score Badge */}
        {gameScore && (
          <div className="hidden sm:flex flex-col items-center justify-center px-2">
            <div className={cn(
              'text-lg font-bold w-10 h-10 rounded-lg flex items-center justify-center',
              gameScore.grade === 'S+' && 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
              gameScore.grade === 'S' && 'bg-gradient-to-br from-amber-300 to-amber-500 text-white',
              gameScore.grade === 'A' && 'bg-gradient-to-br from-indigo-400 to-primary text-white',
              gameScore.grade === 'B' && 'bg-gradient-to-br from-cyan-400 to-teal-500 text-white',
              gameScore.grade === 'C' && 'bg-gradient-to-br from-zinc-400 to-zinc-600 text-white',
              gameScore.grade === 'D' && 'bg-gradient-to-br from-red-400 to-red-600 text-white',
            )}>
              {gameScore.grade}
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">{gameScore.overall}/100</span>
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
                onClick={(e) => { e.stopPropagation(); setActiveTab('overview'); }}
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
                onClick={(e) => { e.stopPropagation(); setActiveTab('analysis'); }}
                className={cn(
                  'flex-1 px-4 py-2.5 text-sm font-medium transition-all',
                  activeTab === 'analysis'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Analysis
              </button>
            </div>

            {/* Tab content */}
            <div className="p-4">
              {activeTab === 'overview' ? (
                <div className="space-y-3">
                  {/* Your team */}
                  <div>
                    <div className="text-xs font-medium mb-2 flex items-center gap-2 flex-wrap">
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
                    </div>
                    <div className="space-y-1">
                      {playerTeam.map((p) => (
                        <PlayerRow
                          key={p.puuid}
                          player={p}
                          region={region}
                          gameDuration={match.gameDuration}
                          isCurrentPlayer={p.puuid === currentPuuid}
                          maxDamage={Math.max(...match.allParticipants.map(x => x.totalDamageDealtToChampions))}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Enemy team */}
                  <div>
                    <div className="text-xs font-medium mb-2 flex items-center gap-2 flex-wrap">
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
                    </div>
                    <div className="space-y-1">
                      {enemyTeam.map((p) => (
                        <PlayerRow
                          key={p.puuid}
                          player={p}
                          region={region}
                          gameDuration={match.gameDuration}
                          isCurrentPlayer={p.puuid === currentPuuid}
                          maxDamage={Math.max(...match.allParticipants.map(x => x.totalDamageDealtToChampions))}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <GameAnalysisTab
                  participant={participant}
                  allParticipants={match.allParticipants}
                  gameDuration={match.gameDuration}
                  isWin={match.win}
                  gameScore={gameScore}
                  teamObjectives={match.teams?.find(t => t.teamId === participant.teamId)}
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

  // Calculate stats
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin = cs / minutes;
  const goldPerMin = participant.goldEarned / minutes;
  const visionPerMin = participant.visionScore / minutes;
  const damagePerMin = participant.totalDamageDealtToChampions / minutes;

  const teamKills = teammates.reduce((sum, p) => sum + p.kills, 0);
  const killParticipation = teamKills > 0
    ? ((participant.kills + participant.assists) / teamKills) * 100
    : 0;

  const kda = participant.deaths === 0
    ? (participant.kills + participant.assists)
    : ((participant.kills + participant.assists) / participant.deaths);

  if (!gameScore) return null;

  return (
    <div className="space-y-4">
      {/* Performance Overview - Similar to Analysis Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Grade + Stat Rings */}
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative flex items-center gap-4 mb-4">
            <div className={cn(
              'text-2xl font-bold w-14 h-14 rounded-xl flex items-center justify-center shadow-lg',
              gameScore.grade === 'S+' && 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
              gameScore.grade === 'S' && 'bg-gradient-to-br from-amber-300 to-amber-500 text-white',
              gameScore.grade === 'A' && 'bg-gradient-to-br from-indigo-400 to-primary text-white',
              gameScore.grade === 'B' && 'bg-gradient-to-br from-cyan-400 to-teal-500 text-white',
              gameScore.grade === 'C' && 'bg-gradient-to-br from-zinc-400 to-zinc-600 text-white',
              gameScore.grade === 'D' && 'bg-gradient-to-br from-red-400 to-red-600 text-white',
            )}>
              {gameScore.grade}
            </div>
            <div>
              <div className="text-xl font-bold">{gameScore.overall}<span className="text-sm font-normal text-muted-foreground">/100</span></div>
              <div className="text-xs text-muted-foreground">Performance Score</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <GameStatRing
              label="KDA"
              value={kda}
              max={5}
              isGood={kda >= 2}
            />
            <GameStatRing
              label="Kill Part."
              value={killParticipation}
              max={100}
              suffix="%"
              isGood={killParticipation >= 50}
            />
            <GameStatRing
              label="CS/min"
              value={csPerMin}
              max={10}
              isGood={csPerMin >= 6}
            />
          </div>
        </div>

        {/* Right: Score Breakdown */}
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-4">
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" />
            Score Breakdown
          </h4>

          <div className="space-y-3 relative">
            <ScoreBar label="Combat" value={gameScore.combat} icon={<Crosshair className="w-3.5 h-3.5" />} />
            <ScoreBar label="Farming" value={gameScore.farming} icon={<Coins className="w-3.5 h-3.5" />} />
            <ScoreBar label="Vision" value={gameScore.vision} icon={<Eye className="w-3.5 h-3.5" />} />
            <ScoreBar label="Objectives" value={gameScore.objectives} icon={<Target className="w-3.5 h-3.5" />} />
          </div>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStatCard label="Damage" value={`${(participant.totalDamageDealtToChampions / 1000).toFixed(1)}k`} icon={<Sword className="h-3.5 w-3.5" />} />
        <MiniStatCard label="Gold" value={`${(participant.goldEarned / 1000).toFixed(1)}k`} icon={<Coins className="h-3.5 w-3.5" />} />
        <MiniStatCard label="Vision" value={participant.visionScore.toString()} icon={<Eye className="h-3.5 w-3.5" />} />
        <MiniStatCard label="Turret DMG" value={`${((participant.damageDealtToTurrets || 0) / 1000).toFixed(1)}k`} icon={<TowerIcon className="h-3.5 w-3.5" />} />
      </div>

      {/* Insights & Improvements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Key Insights */}
        {gameScore.insights.length > 0 && (
          <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-4">
            <div className="absolute top-0 left-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2" />

            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 relative">
              <Zap className="h-4 w-4 text-primary" />
              Strengths
            </h4>

            <div className="space-y-2 relative">
              {gameScore.insights.map((insight, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border/30"
                >
                  <div className="p-1 rounded-md bg-primary/20">
                    <TrendingUp className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-xs">{insight}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* To Improve */}
        {gameScore.improvements.length > 0 ? (
          <div className="relative overflow-hidden rounded-xl border border-destructive/30 bg-gradient-to-br from-destructive/5 via-card to-card p-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 relative">
              <Target className="h-4 w-4 text-destructive" />
              To Improve
            </h4>

            <div className="space-y-2 relative">
              {gameScore.improvements.map((improvement, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border/30"
                >
                  <div className="p-1 rounded-md bg-destructive/20">
                    <TrendingDown className="w-3 h-3 text-destructive" />
                  </div>
                  <span className="text-xs">{improvement}</span>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 relative">
              <Award className="h-4 w-4 text-primary" />
              Perfect Game
            </h4>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-3 text-center relative"
            >
              <span className="text-2xl mb-2">🏆</span>
              <span className="text-sm font-medium text-primary">Nothing to improve!</span>
              <span className="text-xs text-muted-foreground mt-1">You crushed it this game</span>
            </motion.div>
          </div>
        )}
      </div>
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
            <div
              className="h-full bg-primary/60 rounded-full"
              style={{ width: `${damagePercent}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-12 text-right">
            {(player.totalDamageDealtToChampions / 1000).toFixed(1)}k
          </span>
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
