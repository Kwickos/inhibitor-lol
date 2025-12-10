import type { Participant } from '@/types/riot';

/**
 * Normalize role names to consistent format
 */
export function normalizeRole(position: string): string {
  const roleMap: Record<string, string> = {
    TOP: 'TOP',
    JUNGLE: 'JUNGLE',
    MIDDLE: 'MIDDLE',
    MID: 'MIDDLE',
    BOTTOM: 'BOTTOM',
    ADC: 'BOTTOM',
    UTILITY: 'UTILITY',
    SUPPORT: 'UTILITY',
    '': 'MIDDLE',
  };
  return roleMap[position.toUpperCase()] || 'MIDDLE';
}

/**
 * Calculate KDA ratio for a participant
 */
export function getKDA(participant: Participant): number {
  return participant.deaths === 0
    ? participant.kills + participant.assists
    : (participant.kills + participant.assists) / participant.deaths;
}

/**
 * Determine trend direction from array of values
 */
export function getTrend(values: number[]): 'improving' | 'stable' | 'declining' {
  if (values.length < 2) return 'stable';

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

/**
 * Calculate performance consistency (coefficient of variation)
 */
export function calculateConsistency(kdas: number[]): number {
  if (kdas.length < 5) return 0.5;

  const mean = kdas.reduce((a, b) => a + b, 0) / kdas.length;
  const variance = kdas.reduce((sum, kda) => sum + Math.pow(kda - mean, 2), 0) / kdas.length;
  const stdDev = Math.sqrt(variance);

  return stdDev / mean;
}

/**
 * Calculate win/lose streak from matches (sorted most recent first)
 */
export function calculateCurrentStreak(wins: boolean[]): number {
  if (wins.length === 0) return 0;

  const firstResult = wins[0];
  let streak = 0;

  for (const win of wins) {
    if (win === firstResult) {
      streak++;
    } else {
      break;
    }
  }

  return firstResult ? streak : -streak;
}

/**
 * Get percentile from comparison
 */
export function getComparisonPercentile(playerValue: number, benchmarkValue: number): number {
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
