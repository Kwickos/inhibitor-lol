// Player Analysis Types

// Minimum games for reliable analysis
export const MIN_GAMES_FOR_ANALYSIS = 10;
export const RECOMMENDED_GAMES_FOR_ANALYSIS = 50;

export interface PlayerAnalysis {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  queueName: string;
  analyzedGames: number;
  dataQuality: 'excellent' | 'good' | 'limited' | 'insufficient';

  // Overall stats
  overallStats: OverallStats;

  // Per-role breakdown
  roleStats: Record<string, RoleStats>;

  // Champion performance
  championAnalysis: ChampionAnalysis[];

  // Trends over recent games
  trends: PerformanceTrends;

  // Identified strengths and weaknesses
  strengths: AnalysisInsight[];
  weaknesses: AnalysisInsight[];

  // Improvement suggestions
  improvements: ImprovementSuggestion[];
}

export interface OverallStats {
  winRate: number;
  avgKDA: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCS: number;
  avgCSPerMin: number;
  avgVisionScore: number;
  avgVisionPerMin: number;
  avgDamageDealt: number;
  avgDamagePerMin: number;
  avgDamageTaken: number;
  avgGoldEarned: number;
  avgGoldPerMin: number;
  avgKillParticipation: number;
  avgDamageShare: number;
  avgGoldShare: number;
  firstBloodRate: number;
  firstTowerRate: number;
  objectiveParticipation: number;
  multiKillRate: number;
  avgGameDuration: number;
}

export interface RoleStats extends OverallStats {
  role: string;
  games: number;
  // Role-specific benchmarks comparison
  benchmarkComparison: BenchmarkComparison;
}

export interface BenchmarkComparison {
  csPerMin: BenchmarkMetric;
  visionScore: BenchmarkMetric;
  kda: BenchmarkMetric;
  damageShare: BenchmarkMetric;
  goldEfficiency: BenchmarkMetric;
  killParticipation: BenchmarkMetric;
}

export interface BenchmarkMetric {
  value: number;
  benchmark: number; // Average for this role/rank
  percentile: number; // 0-100, where player stands
  rating: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
}

export interface ChampionAnalysis {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKDA: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCS: number;
  avgCSPerMin: number;
  avgDamage: number;
  avgVision: number;
  bestPerformance: MatchPerformance | null;
  worstPerformance: MatchPerformance | null;
}

export interface MatchPerformance {
  matchId: string;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  win: boolean;
  gameCreation: number;
}

export interface PerformanceTrends {
  // Last 20 games split into chunks of 5
  recentKDA: number[];
  recentWinRate: number[];
  recentCS: number[];
  recentVision: number[];
  recentDamage: number[];
  // Trend direction
  kdaTrend: 'improving' | 'stable' | 'declining';
  winRateTrend: 'improving' | 'stable' | 'declining';
  csTrend: 'improving' | 'stable' | 'declining';
  visionTrend: 'improving' | 'stable' | 'declining';
}

export interface AnalysisInsight {
  category: InsightCategory;
  title: string;
  description: string;
  value: number;
  comparison?: string;
  importance: 'high' | 'medium' | 'low';
}

export type InsightCategory =
  | 'combat'
  | 'farming'
  | 'vision'
  | 'objectives'
  | 'consistency'
  | 'survivability'
  | 'teamplay'
  | 'aggression';

export interface ImprovementSuggestion {
  priority: 1 | 2 | 3; // 1 = highest priority
  category: InsightCategory;
  title: string;
  description: string;
  currentValue: number;
  targetValue: number;
  tips: string[];
}

// Role benchmarks for different ranks (approximate values)
export const ROLE_BENCHMARKS: Record<string, Record<string, number>> = {
  TOP: {
    csPerMin: 7.5,
    visionPerMin: 0.8,
    kda: 2.0,
    damageShare: 0.22,
    killParticipation: 0.55,
  },
  JUNGLE: {
    csPerMin: 5.5,
    visionPerMin: 1.0,
    kda: 2.5,
    damageShare: 0.18,
    killParticipation: 0.70,
  },
  MIDDLE: {
    csPerMin: 8.0,
    visionPerMin: 0.9,
    kda: 2.5,
    damageShare: 0.25,
    killParticipation: 0.60,
  },
  BOTTOM: {
    csPerMin: 8.5,
    visionPerMin: 0.7,
    kda: 3.0,
    damageShare: 0.28,
    killParticipation: 0.65,
  },
  UTILITY: {
    csPerMin: 1.5,
    visionPerMin: 2.0,
    kda: 2.5,
    damageShare: 0.10,
    killParticipation: 0.70,
  },
};

// Rating thresholds
export function getRating(value: number, benchmark: number): BenchmarkMetric['rating'] {
  const ratio = value / benchmark;
  if (ratio >= 1.3) return 'excellent';
  if (ratio >= 1.1) return 'good';
  if (ratio >= 0.9) return 'average';
  if (ratio >= 0.7) return 'below_average';
  return 'poor';
}

export function getPercentile(value: number, benchmark: number): number {
  const ratio = value / benchmark;
  // Approximate percentile based on ratio
  if (ratio >= 1.5) return 95;
  if (ratio >= 1.3) return 85;
  if (ratio >= 1.1) return 70;
  if (ratio >= 1.0) return 55;
  if (ratio >= 0.9) return 45;
  if (ratio >= 0.8) return 30;
  if (ratio >= 0.7) return 20;
  return 10;
}
