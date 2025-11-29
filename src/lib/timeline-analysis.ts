import type { TimelineFrame, TimelineEvent } from '@/types/riot';
import type {
  TimelineAnalysis,
  GoldAnalysis,
  LeadAnalysis,
  PowerSpikeAnalysis,
  GoldSwingPeriod,
  ThrowGame,
  ComebackGame,
} from '@/types/analysis';

interface TimelineData {
  matchId: string;
  frames: TimelineFrame[];
  participantId: number;
  opponentId: number; // Lane opponent
  teamId: number;
  win: boolean;
  gameDuration: number;
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
  first: 3000,  // First major item
  second: 6000, // Two items
  third: 9500,  // Three items
};

export function analyzeTimelines(
  timelineDataList: TimelineData[],
  role: string
): TimelineAnalysis {
  const goldAnalysis = analyzeGoldProgression(timelineDataList);
  const leadAnalysis = analyzeLeadsAndThrows(timelineDataList);
  const powerSpikeAnalysis = analyzePowerSpikes(timelineDataList, role);

  return {
    goldAnalysis,
    leadAnalysis,
    powerSpikeAnalysis,
  };
}

function analyzeGoldProgression(timelineDataList: TimelineData[]): GoldAnalysis {
  if (timelineDataList.length === 0) {
    return getEmptyGoldAnalysis();
  }

  let totalGoldAt10 = 0;
  let totalGoldAt15 = 0;
  let totalGoldAt20 = 0;
  let totalGoldDiffAt10 = 0;
  let totalGoldDiffAt15 = 0;
  let totalGoldDiffAt20 = 0;
  let totalGoldFromKills = 0;
  let totalGoldFromCS = 0;
  let gamesAt10 = 0;
  let gamesAt15 = 0;
  let gamesAt20 = 0;

  const allGoldSwings: (GoldSwingPeriod & { severity: number })[] = [];

  for (const data of timelineDataList) {
    const { frames, participantId, opponentId, matchId } = data;

    // Get gold at specific timestamps
    const frame10 = getFrameAtMinute(frames, 10);
    const frame15 = getFrameAtMinute(frames, 15);
    const frame20 = getFrameAtMinute(frames, 20);

    if (frame10) {
      const playerGold = frame10.participantFrames[participantId]?.totalGold || 0;
      const opponentGold = frame10.participantFrames[opponentId]?.totalGold || 0;
      totalGoldAt10 += playerGold;
      totalGoldDiffAt10 += playerGold - opponentGold;
      gamesAt10++;
    }

    if (frame15) {
      const playerGold = frame15.participantFrames[participantId]?.totalGold || 0;
      const opponentGold = frame15.participantFrames[opponentId]?.totalGold || 0;
      totalGoldAt15 += playerGold;
      totalGoldDiffAt15 += playerGold - opponentGold;
      gamesAt15++;
    }

    if (frame20) {
      const playerGold = frame20.participantFrames[participantId]?.totalGold || 0;
      const opponentGold = frame20.participantFrames[opponentId]?.totalGold || 0;
      totalGoldAt20 += playerGold;
      totalGoldDiffAt20 += playerGold - opponentGold;
      gamesAt20++;
    }

    // Analyze gold swings (periods where player lost significant gold relative to game)
    const swings = detectGoldSwings(frames, participantId, matchId);
    allGoldSwings.push(...swings);

    // Estimate gold sources
    const { fromKills, fromCS } = estimateGoldSources(frames, participantId, data.gameDuration);
    totalGoldFromKills += fromKills;
    totalGoldFromCS += fromCS;
  }

  // Sort swings by severity and take worst 5
  allGoldSwings.sort((a, b) => b.severity - a.severity);
  const worstGoldSwings: GoldSwingPeriod[] = allGoldSwings.slice(0, 5).map(s => ({
    matchId: s.matchId,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    goldLost: s.goldLost,
    reason: s.reason,
    details: s.details,
  }));

  const count = timelineDataList.length;

  return {
    avgGoldAt10: gamesAt10 > 0 ? Math.round(totalGoldAt10 / gamesAt10) : 0,
    avgGoldAt15: gamesAt15 > 0 ? Math.round(totalGoldAt15 / gamesAt15) : 0,
    avgGoldAt20: gamesAt20 > 0 ? Math.round(totalGoldAt20 / gamesAt20) : 0,
    avgGoldDiffAt10: gamesAt10 > 0 ? Math.round(totalGoldDiffAt10 / gamesAt10) : 0,
    avgGoldDiffAt15: gamesAt15 > 0 ? Math.round(totalGoldDiffAt15 / gamesAt15) : 0,
    avgGoldDiffAt20: gamesAt20 > 0 ? Math.round(totalGoldDiffAt20 / gamesAt20) : 0,
    avgGoldFromKills: Math.round(totalGoldFromKills / count),
    avgGoldFromCS: Math.round(totalGoldFromCS / count),
    avgGoldFromObjectives: 0, // Hard to track without more event processing
    worstGoldSwings,
    gamesWithTimeline: count,
  };
}

function analyzeLeadsAndThrows(timelineDataList: TimelineData[]): LeadAnalysis {
  if (timelineDataList.length === 0) {
    return getEmptyLeadAnalysis();
  }

  let leadsAt10 = 0;
  let leadsAt15 = 0;
  let leadsAt20 = 0;
  let gamesAt10 = 0;
  let gamesAt15 = 0;
  let gamesAt20 = 0;

  let leadAt15AndWon = 0;
  let leadAt15Count = 0;

  let throws = 0;
  let throwMinuteSum = 0;
  let comebacks = 0;

  let totalMaxLead = 0;
  let totalMaxDeficit = 0;

  let biggestThrow: (ThrowGame & { severity: number }) | null = null;
  let bestComeback: (ComebackGame & { severity: number }) | null = null;

  for (const data of timelineDataList) {
    const { frames, participantId, opponentId, matchId, win } = data;

    // Get gold diff at key timestamps
    const frame10 = getFrameAtMinute(frames, 10);
    const frame15 = getFrameAtMinute(frames, 15);
    const frame20 = getFrameAtMinute(frames, 20);

    if (frame10) {
      const diff = getGoldDiff(frame10, participantId, opponentId);
      if (diff > 0) leadsAt10++;
      gamesAt10++;
    }

    if (frame15) {
      const diff = getGoldDiff(frame15, participantId, opponentId);
      if (diff > 0) {
        leadsAt15++;
        leadAt15Count++;
        if (win) leadAt15AndWon++;
      }
      gamesAt15++;
    }

    if (frame20) {
      const diff = getGoldDiff(frame20, participantId, opponentId);
      if (diff > 0) leadsAt20++;
      gamesAt20++;
    }

    // Track max lead and deficit throughout the game
    let maxLead = 0;
    let maxLeadMinute = 0;
    let maxDeficit = 0;
    let maxDeficitMinute = 0;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const minute = Math.floor(frame.timestamp / 60000);
      const diff = getGoldDiff(frame, participantId, opponentId);

      if (diff > maxLead) {
        maxLead = diff;
        maxLeadMinute = minute;
      }
      if (diff < -maxDeficit) {
        maxDeficit = -diff;
        maxDeficitMinute = minute;
      }
    }

    totalMaxLead += maxLead;
    totalMaxDeficit += maxDeficit;

    // Detect throws (had 2k+ lead but lost)
    if (maxLead >= 2000 && !win) {
      throws++;
      // Find when the throw happened (when lead disappeared)
      let throwMinute = maxLeadMinute;
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const minute = Math.floor(frame.timestamp / 60000);
        const diff = getGoldDiff(frame, participantId, opponentId);
        if (minute > maxLeadMinute && diff <= 0) {
          throwMinute = minute;
          break;
        }
      }
      throwMinuteSum += throwMinute;

      const severity = maxLead;
      if (!biggestThrow || severity > biggestThrow.severity) {
        biggestThrow = {
          matchId,
          maxLead,
          leadAtMinute: maxLeadMinute,
          throwAtMinute: throwMinute,
          finalResult: 'loss',
          severity,
        };
      }
    }

    // Detect comebacks (was 2k+ behind but won)
    if (maxDeficit >= 2000 && win) {
      comebacks++;

      // Find when comeback happened
      let comebackMinute = maxDeficitMinute;
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const minute = Math.floor(frame.timestamp / 60000);
        const diff = getGoldDiff(frame, participantId, opponentId);
        if (minute > maxDeficitMinute && diff >= 0) {
          comebackMinute = minute;
          break;
        }
      }

      const severity = maxDeficit;
      if (!bestComeback || severity > bestComeback.severity) {
        bestComeback = {
          matchId,
          maxDeficit,
          deficitAtMinute: maxDeficitMinute,
          comebackAtMinute: comebackMinute,
          finalResult: 'win',
          severity,
        };
      }
    }
  }

  const count = timelineDataList.length;

  return {
    leadRateAt10: gamesAt10 > 0 ? (leadsAt10 / gamesAt10) * 100 : 0,
    leadRateAt15: gamesAt15 > 0 ? (leadsAt15 / gamesAt15) * 100 : 0,
    leadRateAt20: gamesAt20 > 0 ? (leadsAt20 / gamesAt20) * 100 : 0,
    leadConversionRate: leadAt15Count > 0 ? (leadAt15AndWon / leadAt15Count) * 100 : 0,
    throwRate: count > 0 ? (throws / count) * 100 : 0,
    avgThrowMinute: throws > 0 ? throwMinuteSum / throws : 0,
    comebackRate: count > 0 ? (comebacks / count) * 100 : 0,
    avgMaxLead: Math.round(totalMaxLead / count),
    avgMaxDeficit: Math.round(totalMaxDeficit / count),
    biggestThrow: biggestThrow ? {
      matchId: biggestThrow.matchId,
      maxLead: biggestThrow.maxLead,
      leadAtMinute: biggestThrow.leadAtMinute,
      throwAtMinute: biggestThrow.throwAtMinute,
      finalResult: 'loss',
    } : undefined,
    bestComeback: bestComeback ? {
      matchId: bestComeback.matchId,
      maxDeficit: bestComeback.maxDeficit,
      deficitAtMinute: bestComeback.deficitAtMinute,
      comebackAtMinute: bestComeback.comebackAtMinute,
      finalResult: 'win',
    } : undefined,
  };
}

function analyzePowerSpikes(timelineDataList: TimelineData[], role: string): PowerSpikeAnalysis {
  if (timelineDataList.length === 0) {
    return getEmptyPowerSpikeAnalysis();
  }

  const benchmarks = ITEM_BENCHMARKS[role] || ITEM_BENCHMARKS.MIDDLE;

  let totalFirstItem = 0;
  let totalSecondItem = 0;
  let totalThirdItem = 0;
  let firstItemCount = 0;
  let secondItemCount = 0;
  let thirdItemCount = 0;

  let fastSpikeWins = 0;
  let fastSpikeGames = 0;
  let slowSpikeWins = 0;
  let slowSpikeGames = 0;

  let totalLevelAt10 = 0;
  let totalLevelDiffAt10 = 0;
  let gamesAt10 = 0;

  for (const data of timelineDataList) {
    const { frames, participantId, opponentId, win } = data;

    // Find item spike timings based on gold thresholds
    let firstItemMinute = 0;
    let secondItemMinute = 0;
    let thirdItemMinute = 0;

    for (const frame of frames) {
      const playerFrame = frame.participantFrames[participantId];
      if (!playerFrame) continue;

      const gold = playerFrame.totalGold || 0;
      const minute = frame.timestamp / 60000;

      if (gold >= ITEM_GOLD_THRESHOLDS.first && firstItemMinute === 0) {
        firstItemMinute = minute;
      }
      if (gold >= ITEM_GOLD_THRESHOLDS.second && secondItemMinute === 0) {
        secondItemMinute = minute;
      }
      if (gold >= ITEM_GOLD_THRESHOLDS.third && thirdItemMinute === 0) {
        thirdItemMinute = minute;
      }
    }

    if (firstItemMinute > 0) {
      totalFirstItem += firstItemMinute;
      firstItemCount++;

      // Track fast vs slow spikes
      if (firstItemMinute <= benchmarks.first) {
        fastSpikeGames++;
        if (win) fastSpikeWins++;
      } else {
        slowSpikeGames++;
        if (win) slowSpikeWins++;
      }
    }
    if (secondItemMinute > 0) {
      totalSecondItem += secondItemMinute;
      secondItemCount++;
    }
    if (thirdItemMinute > 0) {
      totalThirdItem += thirdItemMinute;
      thirdItemCount++;
    }

    // Level at 10 minutes
    const frame10 = getFrameAtMinute(frames, 10);
    if (frame10) {
      const playerFrame = frame10.participantFrames[participantId];
      const opponentFrame = frame10.participantFrames[opponentId];
      if (playerFrame && opponentFrame) {
        totalLevelAt10 += playerFrame.level || 0;
        totalLevelDiffAt10 += (playerFrame.level || 0) - (opponentFrame.level || 0);
        gamesAt10++;
      }
    }
  }

  const avgFirst = firstItemCount > 0 ? totalFirstItem / firstItemCount : 0;
  const avgSecond = secondItemCount > 0 ? totalSecondItem / secondItemCount : 0;
  const avgThird = thirdItemCount > 0 ? totalThirdItem / thirdItemCount : 0;

  return {
    avgFirstItemMinute: Math.round(avgFirst * 10) / 10,
    avgSecondItemMinute: Math.round(avgSecond * 10) / 10,
    avgThirdItemMinute: Math.round(avgThird * 10) / 10,
    firstItemDelta: Math.round((avgFirst - benchmarks.first) * 10) / 10,
    secondItemDelta: Math.round((avgSecond - benchmarks.second) * 10) / 10,
    thirdItemDelta: Math.round((avgThird - benchmarks.third) * 10) / 10,
    winRateWithFastSpike: fastSpikeGames > 0 ? (fastSpikeWins / fastSpikeGames) * 100 : 0,
    winRateWithSlowSpike: slowSpikeGames > 0 ? (slowSpikeWins / slowSpikeGames) * 100 : 0,
    avgLevelAt10: gamesAt10 > 0 ? Math.round((totalLevelAt10 / gamesAt10) * 10) / 10 : 0,
    avgLevelDiffAt10: gamesAt10 > 0 ? Math.round((totalLevelDiffAt10 / gamesAt10) * 10) / 10 : 0,
  };
}

// Helper functions

function getFrameAtMinute(frames: TimelineFrame[], minute: number): TimelineFrame | null {
  const targetTimestamp = minute * 60000;
  // Find the closest frame to the target minute
  let closest: TimelineFrame | null = null;
  let closestDiff = Infinity;

  for (const frame of frames) {
    const diff = Math.abs(frame.timestamp - targetTimestamp);
    if (diff < closestDiff && frame.timestamp <= targetTimestamp + 30000) {
      closest = frame;
      closestDiff = diff;
    }
  }

  return closest;
}

function getGoldDiff(frame: TimelineFrame, participantId: number, opponentId: number): number {
  const playerGold = frame.participantFrames[participantId]?.totalGold || 0;
  const opponentGold = frame.participantFrames[opponentId]?.totalGold || 0;
  return playerGold - opponentGold;
}

function detectGoldSwings(
  frames: TimelineFrame[],
  participantId: number,
  matchId: string
): (GoldSwingPeriod & { severity: number })[] {
  const swings: (GoldSwingPeriod & { severity: number })[] = [];

  // Look at 5-minute windows
  for (let startMin = 0; startMin < frames.length * 60000 / frames[0]?.timestamp - 5; startMin += 5) {
    const startFrame = getFrameAtMinute(frames, startMin);
    const endFrame = getFrameAtMinute(frames, startMin + 5);

    if (!startFrame || !endFrame) continue;

    const startGold = startFrame.participantFrames[participantId]?.totalGold || 0;
    const endGold = endFrame.participantFrames[participantId]?.totalGold || 0;
    const goldGained = endGold - startGold;

    // Expected gold in 5 minutes (rough estimate: ~400 GPM = 2000 gold per 5 min)
    const expectedGold = 2000;

    if (goldGained < expectedGold * 0.5) {
      // Significant gold deficit in this window
      const goldLost = expectedGold - goldGained;
      const severity = goldLost;

      // Try to determine reason
      let reason: GoldSwingPeriod['reason'] = 'mixed';
      const startCS = (startFrame.participantFrames[participantId]?.minionsKilled || 0) +
                      (startFrame.participantFrames[participantId]?.jungleMinionsKilled || 0);
      const endCS = (endFrame.participantFrames[participantId]?.minionsKilled || 0) +
                    (endFrame.participantFrames[participantId]?.jungleMinionsKilled || 0);
      const csDiff = endCS - startCS;

      // Expected ~35-40 CS in 5 minutes for laners
      if (csDiff < 20) {
        reason = 'cs_deficit';
      }

      swings.push({
        matchId,
        startMinute: startMin,
        endMinute: startMin + 5,
        goldLost,
        reason,
        details: `Only gained ${goldGained}g (expected ~${expectedGold}g)`,
        severity,
      });
    }
  }

  return swings;
}

function estimateGoldSources(
  frames: TimelineFrame[],
  participantId: number,
  gameDuration: number
): { fromKills: number; fromCS: number } {
  // Get final frame stats
  const finalFrame = frames[frames.length - 1];
  if (!finalFrame) return { fromKills: 0, fromCS: 0 };

  const playerFrame = finalFrame.participantFrames[participantId];
  if (!playerFrame) return { fromKills: 0, fromCS: 0 };

  const totalCS = (playerFrame.minionsKilled || 0) + (playerFrame.jungleMinionsKilled || 0);

  // Approximate gold from CS (average ~20g per minion)
  const fromCS = totalCS * 20;

  // Total gold minus CS gold = kills + objectives + passive
  const totalGold = playerFrame.totalGold || 0;
  const fromKills = Math.max(0, totalGold - fromCS - (gameDuration / 60 * 100)); // Subtract passive gold

  return { fromKills, fromCS };
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
