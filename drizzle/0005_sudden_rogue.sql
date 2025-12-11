ALTER TABLE `player_matches` ADD `game_score` integer;--> statement-breakpoint
ALTER TABLE `player_matches` ADD `game_grade` text;--> statement-breakpoint
CREATE INDEX `idx_player_matches_puuid` ON `player_matches` (`puuid`);