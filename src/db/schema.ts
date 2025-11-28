import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// Summoners table - Cache des profils
export const summoners = sqliteTable('summoners', {
  puuid: text('puuid').primaryKey(),
  gameName: text('game_name').notNull(),
  tagLine: text('tag_line').notNull(),
  region: text('region').notNull(),
  summonerId: text('summoner_id').notNull(),
  profileIconId: integer('profile_icon_id').notNull(),
  summonerLevel: integer('summoner_level').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Matches table - Cache des matchs
export const matches = sqliteTable('matches', {
  matchId: text('match_id').primaryKey(),
  gameCreation: integer('game_creation').notNull(),
  gameDuration: integer('game_duration').notNull(),
  gameMode: text('game_mode').notNull(),
  queueId: integer('queue_id').notNull(),
  participants: text('participants', { mode: 'json' }).notNull(), // JSON array of participant data
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// PlayerMatches table - Relation joueur/match
export const playerMatches = sqliteTable(
  'player_matches',
  {
    puuid: text('puuid').notNull(),
    matchId: text('match_id').notNull(),
    win: integer('win', { mode: 'boolean' }).notNull(),
    championId: integer('champion_id').notNull(),
    championName: text('champion_name').notNull(),
    kills: integer('kills').notNull(),
    deaths: integer('deaths').notNull(),
    assists: integer('assists').notNull(),
    cs: integer('cs').notNull(),
    visionScore: integer('vision_score').notNull(),
    teamPosition: text('team_position'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.puuid, table.matchId] }),
  })
);

// Ranks table - Cache des rangs
export const ranks = sqliteTable(
  'ranks',
  {
    puuid: text('puuid').notNull(),
    queueType: text('queue_type').notNull(), // RANKED_SOLO_5x5, RANKED_FLEX_SR
    tier: text('tier').notNull(),
    rank: text('rank').notNull(),
    leaguePoints: integer('league_points').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.puuid, table.queueType] }),
  })
);

// Champion position rates table - Aggregated from match data
export const championPositionRates = sqliteTable(
  'champion_position_rates',
  {
    championId: integer('champion_id').notNull(),
    position: text('position').notNull(), // TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY
    gamesPlayed: integer('games_played').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.championId, table.position] }),
  })
);

// Types for insertions
export type InsertSummoner = typeof summoners.$inferInsert;
export type SelectSummoner = typeof summoners.$inferSelect;

export type InsertMatch = typeof matches.$inferInsert;
export type SelectMatch = typeof matches.$inferSelect;

export type InsertPlayerMatch = typeof playerMatches.$inferInsert;
export type SelectPlayerMatch = typeof playerMatches.$inferSelect;

export type InsertRank = typeof ranks.$inferInsert;
export type SelectRank = typeof ranks.$inferSelect;

export type InsertChampionPositionRate = typeof championPositionRates.$inferInsert;
export type SelectChampionPositionRate = typeof championPositionRates.$inferSelect;
