-- Add index on puuid for fast player match lookups
CREATE INDEX IF NOT EXISTS idx_player_matches_puuid ON player_matches(puuid);
