import type { TimelineFrame } from '@/types/riot';
import type {
  TimelineAnalysis,
  GoldAnalysis,
  LeadAnalysis,
  PowerSpikeAnalysis,
  GoldSwingPeriod,
  ThrowGame,
  ComebackGame,
} from '@/types/analysis';

// Single game stats extracted from timeline (lightweight)
interface SingleGameStats {
  matchId: string;
  win: boolean;
  // Gold stats
  goldAt10: number | null;
  goldAt15: number | null;
  goldAt20: number | null;
  goldDiffAt10: number | null;
  goldDiffAt15: number | null;
  goldDiffAt20: number | null;
  goldFromKills: number;
  goldFromCS: number;
  // Lead stats
  maxLead: number;
  maxLeadMinute: number;
  maxDeficit: number;
  maxDeficitMinute: number;
  throwMinute: number | null; // null if no throw
  comebackMinute: number | null; // null if no comeback
  // Power spike stats
  firstItemMinute: number | null;
  secondItemMinute: number | null;
  thirdItemMinute: number | null;
  levelAt10: number | null;
  levelDiffAt10: number | null;
  // Gold swings
  worstGoldSwing: (GoldSwingPeriod & { severity: number }) | null;
}

// Power spike benchmarks by role (minutes to complete items)
const ITEM_BENCHMARKS: Record<string, { first: number; second: number; third: number }> = {
  TOP: { first: 10, second: 18, third: 25 },
  JUNGLE: { first: 9, second: 17, third: 24 },
  MIDDLE: { first: 10, second: 18, third: 25 },
  BOTTOM: { first: 11, second: 19, third: 26 },
  UTILITY: { first: 14, second: 22, third: 30 },
};

// Approximate gold values for completed items
const ITEM_GOLD_THRESHOLDS = {
  first: 3000,
  second: 6000,
  third: 9500,
};

/**
 * Analyze a single timeline and extract all needed stats
 * This processes the timeline immediately and doesn't store frames
 */
export function analyzeSingleTimeline(
  matchId: string,
  frames: TimelineFrame[],
  participantId: number,
  opponentId: number,
  win: boolean,
  gameDuration: number
): SingleGameStats {
  const stats: SingleGameStats = {
    matchId,
    win,
    goldAt10: null,
    goldAt15: null,
    goldAt20: null,
    goldDiffAt10: null,
    goldDiffAt15: null,
    goldDiffAt20: null,
    goldFromKills: 0,
    goldFromCS: 0,
    maxLead: 0,
    maxLeadMinute: 0,
    maxDeficit: 0,
    maxDeficitMinute: 0,
    throwMinute: null,
    comebackMinute: null,
    firstItemMinute: null,
    secondItemMinute: null,
    thirdItemMinute: null,
    levelAt10: null,
    levelDiffAt10: null,
    worstGoldSwing: null,
  };

  // Process frames once to extract all stats
  let prevGold = 0;
  let prevMinute = 0;
  let worstSwingSeverity = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const minute = Math.floor(frame.timestamp / 60000);
    const playerFrame = frame.participantFrames[participantId];
    const opponentFrame = frame.participantFrames[opponentId];

    if (!playerFrame) continue;

    const playerGold = playerFrame.totalGold || 0;
    const opponentGold = opponentFrame?.totalGold || 0;
    const goldDiff = playerGold - opponentGold;

    // Gold at key timestamps (within 30s tolerance)
    if (minute >= 10 && minute <= 10 && stats.goldAt10 === null) {
      stats.goldAt10 = playerGold;
      stats.goldDiffAt10 = goldDiff;
      stats.levelAt10 = playerFrame.level || 0;
      stats.levelDiffAt10 = (playerFrame.level || 0) - (opponentFrame?.level || 0);
    }
    if (minute >= 15 && minute <= 15 && stats.goldAt15 === null) {
      stats.goldAt15 = playerGold;
      stats.goldDiffAt15 = goldDiff;
    }
    if (minute >= 20 && minute <= 20 && stats.goldAt20 === null) {
      stats.goldAt20 = playerGold;
      stats.goldDiffAt20 = goldDiff;
    }

    // Track max lead and deficit
    if (goldDiff > stats.maxLead) {
      stats.maxLead = goldDiff;
      stats.maxLeadMinute = minute;
    }
    if (goldDiff < -stats.maxDeficit) {
      stats.maxDeficit = -goldDiff;
      stats.maxDeficitMinute = minute;
    }

    // Item spike timing
    if (playerGold >= ITEM_GOLD_THRESHOLDS.first && stats.firstItemMinute === null) {
      stats.firstItemMinute = frame.timestamp / 60000;
    }
    if (playerGold >= ITEM_GOLD_THRESHOLDS.second && stats.secondItemMinute === null) {
      stats.secondItemMinute = frame.timestamp / 60000;
    }
    if (playerGold >= ITEM_GOLD_THRESHOLDS.third && stats.thirdItemMinute === null) {
      stats.thirdItemMinute = frame.timestamp / 60000;
    }

    // Gold swing detection (check every 5 minutes)
    if (minute > 0 && minute % 5 === 0 && minute !== prevMinute) {
      const goldGained = playerGold - prevGold;
      const expectedGold = 2000; // ~400 GPM for 5 min

      if (goldGained < expectedGold * 0.5) {
        const goldLost = expectedGold - goldGained;
        if (goldLost > worstSwingSeverity) {
          worstSwingSeverity = goldLost;

          // Determine reason
          const prevFrame = frames[Math.max(0, i - 5)] || frame;
          const prevCS = (prevFrame.participantFrames[participantId]?.minionsKilled || 0) +
                        (prevFrame.participantFrames[participantId]?.jungleMinionsKilled || 0);
          const currCS = (playerFrame.minionsKilled || 0) + (playerFrame.jungleMinionsKilled || 0);
          const csDiff = currCS - prevCS;

          stats.worstGoldSwing = {
            matchId,
            startMinute: minute - 5,
            endMinute: minute,
            goldLost,
            reason: csDiff < 20 ? 'cs_deficit' : 'mixed',
            details: `Only gained ${goldGained}g (expected ~${expectedGold}g)`,
            severity: goldLost,
          };
        }
      }
      prevGold = playerGold;
      prevMinute = minute;
    }

    // Initialize prevGold on first frame
    if (i === 0) {
      prevGold = playerGold;
    }
  }

  // Detect throw (had 2k+ lead but lost)
  if (stats.maxLead >= 2000 && !win) {
    // Find when throw happened
    for (const frame of frames) {
      const minute = Math.floor(frame.timestamp / 60000);
      if (minute > stats.maxLeadMinute) {
        const playerGold = frame.participantFrames[participantId]?.totalGold || 0;
        const opponentGold = frame.participantFrames[opponentId]?.totalGold || 0;
        if (playerGold - opponentGold <= 0) {
          stats.throwMinute = minute;
          break;
        }
      }
    }
    if (stats.throwMinute === null) {
      stats.throwMinute = stats.maxLeadMinute;
    }
  }

  // Detect comeback (was 2k+ behind but won)
  if (stats.maxDeficit >= 2000 && win) {
    // Find when comeback happened
    for (const frame of frames) {
      const minute = Math.floor(frame.timestamp / 60000);
      if (minute > stats.maxDeficitMinute) {
        const playerGold = frame.participantFrames[participantId]?.totalGold || 0;
        const opponentGold = frame.participantFrames[opponentId]?.totalGold || 0;
        if (playerGold - opponentGold >= 0) {
          stats.comebackMinute = minute;
          break;
        }
      }
    }
    if (stats.comebackMinute === null) {
      stats.comebackMinute = stats.maxDeficitMinute;
    }
  }

  // Estimate gold sources from final frame
  const finalFrame = frames[frames.length - 1];
  if (finalFrame) {
    const playerFrame = finalFrame.participantFrames[participantId];
    if (playerFrame) {
      const totalCS = (playerFrame.minionsKilled || 0) + (playerFrame.jungleMinionsKilled || 0);
      stats.goldFromCS = totalCS * 20;
      const totalGold = playerFrame.totalGold || 0;
      stats.goldFromKills = Math.max(0, totalGold - stats.goldFromCS - (gameDuration / 60 * 100));
    }
  }

  return stats;
}

/**
 * Aggregate stats from multiple games into final analysis
 */
export function aggregateTimelineStats(
  gameStats: SingleGameStats[],
  role: string
): TimelineAnalysis {
  if (gameStats.length === 0) {
    return {
      goldAnalysis: getEmptyGoldAnalysis(),
      leadAnalysis: getEmptyLeadAnalysis(),
      powerSpikeAnalysis: getEmptyPowerSpikeAnalysis(),
    };
  }

  const benchmarks = ITEM_BENCHMARKS[role] || ITEM_BENCHMARKS.MIDDLE;

  // Aggregate gold stats
  let totalGoldAt10 = 0, gamesAt10 = 0;
  let totalGoldAt15 = 0, gamesAt15 = 0;
  let totalGoldAt20 = 0, gamesAt20 = 0;
  let totalGoldDiffAt10 = 0;
  let totalGoldDiffAt15 = 0;
  let totalGoldDiffAt20 = 0;
  let totalGoldFromKills = 0;
  let totalGoldFromCS = 0;

  // Aggregate lead stats
  let leadsAt10 = 0, leadsAt15 = 0, leadsAt20 = 0;
  let leadAt15AndWon = 0, leadAt15Count = 0;
  let throws = 0, throwMinuteSum = 0;
  let comebacks = 0;
  let totalMaxLead = 0, totalMaxDeficit = 0;
  let biggestThrow: ThrowGame | null = null;
  let biggestThrowSeverity = 0;
  let bestComeback: ComebackGame | null = null;
  let bestComebackSeverity = 0;

  // Aggregate power spike stats
  let totalFirstItem = 0, firstItemCount = 0;
  let totalSecondItem = 0, secondItemCount = 0;
  let totalThirdItem = 0, thirdItemCount = 0;
  let fastSpikeWins = 0, fastSpikeGames = 0;
  let slowSpikeWins = 0, slowSpikeGames = 0;
  let totalLevelAt10 = 0, totalLevelDiffAt10 = 0, levelGames = 0;

  // Collect worst gold swings
  const allGoldSwings: (GoldSwingPeriod & { severity: number })[] = [];

  for (const stats of gameStats) {
    // Gold progression
    if (stats.goldAt10 !== null) {
      totalGoldAt10 += stats.goldAt10;
      totalGoldDiffAt10 += stats.goldDiffAt10!;
      gamesAt10++;
      if (stats.goldDiffAt10! > 0) leadsAt10++;
    }
    if (stats.goldAt15 !== null) {
      totalGoldAt15 += stats.goldAt15;
      totalGoldDiffAt15 += stats.goldDiffAt15!;
      gamesAt15++;
      if (stats.goldDiffAt15! > 0) {
        leadsAt15++;
        leadAt15Count++;
        if (stats.win) leadAt15AndWon++;
      }
    }
    if (stats.goldAt20 !== null) {
      totalGoldAt20 += stats.goldAt20;
      totalGoldDiffAt20 += stats.goldDiffAt20!;
      gamesAt20++;
      if (stats.goldDiffAt20! > 0) leadsAt20++;
    }

    totalGoldFromKills += stats.goldFromKills;
    totalGoldFromCS += stats.goldFromCS;

    // Lead/throw analysis
    totalMaxLead += stats.maxLead;
    totalMaxDeficit += stats.maxDeficit;

    if (stats.throwMinute !== null) {
      throws++;
      throwMinuteSum += stats.throwMinute;
      if (stats.maxLead > biggestThrowSeverity) {
        biggestThrowSeverity = stats.maxLead;
        biggestThrow = {
          matchId: stats.matchId,
          maxLead: stats.maxLead,
          leadAtMinute: stats.maxLeadMinute,
          throwAtMinute: stats.throwMinute,
          finalResult: 'loss',
        };
      }
    }

    if (stats.comebackMinute !== null) {
      comebacks++;
      if (stats.maxDeficit > bestComebackSeverity) {
        bestComebackSeverity = stats.maxDeficit;
        bestComeback = {
          matchId: stats.matchId,
          maxDeficit: stats.maxDeficit,
          deficitAtMinute: stats.maxDeficitMinute,
          comebackAtMinute: stats.comebackMinute,
          finalResult: 'win',
        };
      }
    }

    // Power spikes
    if (stats.firstItemMinute !== null) {
      totalFirstItem += stats.firstItemMinute;
      firstItemCount++;
      if (stats.firstItemMinute <= benchmarks.first) {
        fastSpikeGames++;
        if (stats.win) fastSpikeWins++;
      } else {
        slowSpikeGames++;
        if (stats.win) slowSpikeWins++;
      }
    }
    if (stats.secondItemMinute !== null) {
      totalSecondItem += stats.secondItemMinute;
      secondItemCount++;
    }
    if (stats.thirdItemMinute !== null) {
      totalThirdItem += stats.thirdItemMinute;
      thirdItemCount++;
    }
    if (stats.levelAt10 !== null) {
      totalLevelAt10 += stats.levelAt10;
      totalLevelDiffAt10 += stats.levelDiffAt10!;
      levelGames++;
    }

    // Gold swings
    if (stats.worstGoldSwing) {
      allGoldSwings.push(stats.worstGoldSwing);
    }
  }

  const count = gameStats.length;

  // Sort and take worst 5 gold swings
  allGoldSwings.sort((a, b) => b.severity - a.severity);
  const worstGoldSwings: GoldSwingPeriod[] = allGoldSwings.slice(0, 5).map(s => ({
    matchId: s.matchId,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    goldLost: s.goldLost,
    reason: s.reason,
    details: s.details,
  }));

  const avgFirst = firstItemCount > 0 ? totalFirstItem / firstItemCount : 0;
  const avgSecond = secondItemCount > 0 ? totalSecondItem / secondItemCount : 0;
  const avgThird = thirdItemCount > 0 ? totalThirdItem / thirdItemCount : 0;

  return {
    goldAnalysis: {
      avgGoldAt10: gamesAt10 > 0 ? Math.round(totalGoldAt10 / gamesAt10) : 0,
      avgGoldAt15: gamesAt15 > 0 ? Math.round(totalGoldAt15 / gamesAt15) : 0,
      avgGoldAt20: gamesAt20 > 0 ? Math.round(totalGoldAt20 / gamesAt20) : 0,
      avgGoldDiffAt10: gamesAt10 > 0 ? Math.round(totalGoldDiffAt10 / gamesAt10) : 0,
      avgGoldDiffAt15: gamesAt15 > 0 ? Math.round(totalGoldDiffAt15 / gamesAt15) : 0,
      avgGoldDiffAt20: gamesAt20 > 0 ? Math.round(totalGoldDiffAt20 / gamesAt20) : 0,
      avgGoldFromKills: Math.round(totalGoldFromKills / count),
      avgGoldFromCS: Math.round(totalGoldFromCS / count),
      avgGoldFromObjectives: 0,
      worstGoldSwings,
      gamesWithTimeline: count,
    },
    leadAnalysis: {
      leadRateAt10: gamesAt10 > 0 ? (leadsAt10 / gamesAt10) * 100 : 0,
      leadRateAt15: gamesAt15 > 0 ? (leadsAt15 / gamesAt15) * 100 : 0,
      leadRateAt20: gamesAt20 > 0 ? (leadsAt20 / gamesAt20) * 100 : 0,
      leadConversionRate: leadAt15Count > 0 ? (leadAt15AndWon / leadAt15Count) * 100 : 0,
      throwRate: count > 0 ? (throws / count) * 100 : 0,
      avgThrowMinute: throws > 0 ? throwMinuteSum / throws : 0,
      comebackRate: count > 0 ? (comebacks / count) * 100 : 0,
      avgMaxLead: Math.round(totalMaxLead / count),
      avgMaxDeficit: Math.round(totalMaxDeficit / count),
      biggestThrow: biggestThrow || undefined,
      bestComeback: bestComeback || undefined,
    },
    powerSpikeAnalysis: {
      avgFirstItemMinute: Math.round(avgFirst * 10) / 10,
      avgSecondItemMinute: Math.round(avgSecond * 10) / 10,
      avgThirdItemMinute: Math.round(avgThird * 10) / 10,
      firstItemDelta: Math.round((avgFirst - benchmarks.first) * 10) / 10,
      secondItemDelta: Math.round((avgSecond - benchmarks.second) * 10) / 10,
      thirdItemDelta: Math.round((avgThird - benchmarks.third) * 10) / 10,
      winRateWithFastSpike: fastSpikeGames > 0 ? (fastSpikeWins / fastSpikeGames) * 100 : 0,
      winRateWithSlowSpike: slowSpikeGames > 0 ? (slowSpikeWins / slowSpikeGames) * 100 : 0,
      avgLevelAt10: levelGames > 0 ? Math.round((totalLevelAt10 / levelGames) * 10) / 10 : 0,
      avgLevelDiffAt10: levelGames > 0 ? Math.round((totalLevelDiffAt10 / levelGames) * 10) / 10 : 0,
    },
  };
}

function getEmptyGoldAnalysis(): GoldAnalysis {
  return {
    avgGoldAt10: 0,
    avgGoldAt15: 0,
    avgGoldAt20: 0,
    avgGoldDiffAt10: 0,
    avgGoldDiffAt15: 0,
    avgGoldDiffAt20: 0,
    avgGoldFromKills: 0,
    avgGoldFromCS: 0,
    avgGoldFromObjectives: 0,
    worstGoldSwings: [],
    gamesWithTimeline: 0,
  };
}

function getEmptyLeadAnalysis(): LeadAnalysis {
  return {
    leadRateAt10: 0,
    leadRateAt15: 0,
    leadRateAt20: 0,
    leadConversionRate: 0,
    throwRate: 0,
    avgThrowMinute: 0,
    comebackRate: 0,
    avgMaxLead: 0,
    avgMaxDeficit: 0,
  };
}

function getEmptyPowerSpikeAnalysis(): PowerSpikeAnalysis {
  return {
    avgFirstItemMinute: 0,
    avgSecondItemMinute: 0,
    avgThirdItemMinute: 0,
    firstItemDelta: 0,
    secondItemDelta: 0,
    thirdItemDelta: 0,
    winRateWithFastSpike: 0,
    winRateWithSlowSpike: 0,
    avgLevelAt10: 0,
    avgLevelDiffAt10: 0,
  };
}
