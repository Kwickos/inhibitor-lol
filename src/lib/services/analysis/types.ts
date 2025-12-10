import type { Match, Participant, Team } from '@/types/riot';

export interface PlayerMatch {
  match: Match;
  participant: Participant;
  team: Team;
  allParticipants: Participant[];
  gameDuration: number;
}

export interface DeathAnalysis {
  avgDeathsFirst15Min: number;
  deathsInWonGames: number;
  deathsInLostGames: number;
}

export interface EarlyGameAnalysis {
  avgLaneMinions10?: number;
  avgEarlyGoldAdv?: number;
}

export interface PlayerStats {
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
}
