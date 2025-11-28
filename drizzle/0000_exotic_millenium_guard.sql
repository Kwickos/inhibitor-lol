CREATE TABLE `champion_position_rates` (
	`champion_id` integer NOT NULL,
	`position` text NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`champion_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`match_id` text PRIMARY KEY NOT NULL,
	`game_creation` integer NOT NULL,
	`game_duration` integer NOT NULL,
	`game_mode` text NOT NULL,
	`queue_id` integer NOT NULL,
	`participants` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_matches` (
	`puuid` text NOT NULL,
	`match_id` text NOT NULL,
	`win` integer NOT NULL,
	`champion_id` integer NOT NULL,
	`champion_name` text NOT NULL,
	`kills` integer NOT NULL,
	`deaths` integer NOT NULL,
	`assists` integer NOT NULL,
	`cs` integer NOT NULL,
	`vision_score` integer NOT NULL,
	`team_position` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`puuid`, `match_id`)
);
--> statement-breakpoint
CREATE TABLE `ranks` (
	`puuid` text NOT NULL,
	`queue_type` text NOT NULL,
	`tier` text NOT NULL,
	`rank` text NOT NULL,
	`league_points` integer NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`puuid`, `queue_type`)
);
--> statement-breakpoint
CREATE TABLE `summoners` (
	`puuid` text PRIMARY KEY NOT NULL,
	`game_name` text NOT NULL,
	`tag_line` text NOT NULL,
	`region` text NOT NULL,
	`summoner_id` text NOT NULL,
	`profile_icon_id` integer NOT NULL,
	`summoner_level` integer NOT NULL,
	`updated_at` integer NOT NULL
);
