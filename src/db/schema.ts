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

// Matches table - Cache des matchs (stores FULL API response for deep analytics)
export const matches = sqliteTable('matches', {
  matchId: text('match_id').primaryKey(),
  gameCreation: integer('game_creation').notNull(),
  gameDuration: integer('game_duration').notNull(),
  gameMode: text('game_mode').notNull(),
  queueId: integer('queue_id').notNull(),
  // Additional match metadata for filtering/analytics
  gameVersion: text('game_version'), // Patch version (e.g., "14.23.1")
  mapId: integer('map_id'), // 11 = Summoner's Rift, 12 = ARAM, etc.
  platformId: text('platform_id'), // EUW1, NA1, etc.
  gameType: text('game_type'), // MATCHED_GAME, CUSTOM_GAME, etc.
  endOfGameResult: text('end_of_game_result'), // GameComplete, Surrender, etc.
  // Full data as JSON (includes ALL participant data with challenges, pings, etc.)
  participants: text('participants', { mode: 'json' }).notNull(), // JSON array of participant data
  teams: text('teams', { mode: 'json' }), // JSON array of team data (objectives, etc.)
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// PlayerMatches table - Relation joueur/match with key stats for fast queries
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
    // Extended stats for analytics (denormalized for fast queries)
    goldEarned: integer('gold_earned'),
    totalDamageDealtToChampions: integer('total_damage_dealt_to_champions'),
    totalDamageTaken: integer('total_damage_taken'),
    totalHeal: integer('total_heal'),
    totalDamageShieldedOnTeammates: integer('total_damage_shielded_on_teammates'),
    wardsPlaced: integer('wards_placed'),
    wardsKilled: integer('wards_killed'),
    controlWardsPlaced: integer('control_wards_placed'),
    doubleKills: integer('double_kills'),
    tripleKills: integer('triple_kills'),
    quadraKills: integer('quadra_kills'),
    pentaKills: integer('penta_kills'),
    firstBloodKill: integer('first_blood_kill', { mode: 'boolean' }),
    turretKills: integer('turret_kills'),
    objectivesStolen: integer('objectives_stolen'),
    // Challenges stats (key metrics)
    damagePerMinute: integer('damage_per_minute'), // stored as int (multiply by 100)
    goldPerMinute: integer('gold_per_minute'),
    kda: integer('kda'), // stored as int (multiply by 100)
    killParticipation: integer('kill_participation'), // stored as int (0-100)
    teamDamagePercentage: integer('team_damage_percentage'), // stored as int (0-100)
    visionScorePerMinute: integer('vision_score_per_minute'), // stored as int (multiply by 100)
    soloKills: integer('solo_kills'),
    skillshotsDodged: integer('skillshots_dodged'),
    skillshotsHit: integer('skillshots_hit'),
    // Time data
    timePlayed: integer('time_played'),
    totalTimeSpentDead: integer('total_time_spent_dead'),
    // Items (for build path analysis)
    item0: integer('item0'),
    item1: integer('item1'),
    item2: integer('item2'),
    item3: integer('item3'),
    item4: integer('item4'),
    item5: integer('item5'),
    item6: integer('item6'),
    // Summoner spells
    summoner1Id: integer('summoner1_id'),
    summoner2Id: integer('summoner2_id'),
    // Runes (primary tree)
    primaryRune: integer('primary_rune'),
    secondaryRune: integer('secondary_rune'),
    // Game metadata (denormalized for filtering)
    queueId: integer('queue_id'),
    gameVersion: text('game_version'),
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
