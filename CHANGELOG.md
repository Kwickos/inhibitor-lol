# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-11

### Added

#### Live Game
- Real-time detection when player is in game
- Lane opponent analysis with matchup tips
- Personalized game plan based on matchup

#### Scoring System
- Game grades: S+, S, A, B, C, D
- Sub-scores: Combat, Farming, Vision, Objectives
- Comparison with high elo benchmarks
- Scores saved to DB for instant loading
- Scoring disabled for ARAM/Arena modes (not relevant)

#### Remake Detection
- Games < 5 min automatically marked as "Remake"
- Neutral display (gray) - no win/loss
- No score calculated for remakes

#### Deep Analysis
- Real-time gold graphs
- Power spike detection
- Role-specific coaching insights
- Key events timeline

#### Social Features
- Duo partners detection
- Search history
- Search suggestions

#### Performance
- Instant loading from cache
- Lazy loading for match details (allParticipants, teams)
- Rate limiting (60/min standard, 10/min for expensive ops)
- Background refresh for new matches
- Health check endpoint

#### Technical
- Zod validation on all API routes
- Drizzle migrations for schema changes
- champLevel, teamId, killParticipation stored in DB
- gameEndedInEarlySurrender for remake detection

### New API Endpoints
- `GET /api/health` - Health check
- `GET /api/live-game/[region]/[summonerId]` - Live game detection
- `GET /api/analysis/[puuid]` - Deep analysis
- `GET /api/duo-partners/[puuid]` - Duo partners
- `GET /api/champion-benchmarks` - High elo benchmarks
- `POST /api/matches/[puuid]/[matchId]/score` - Save calculated score
- `GET/POST /api/recalculate-scores/[puuid]` - Backfill missing scores

## [0.1.0] - 2025-12-09

### Added
- Initial release
- Basic match history display
- Summoner profile lookup
- Champion stats
