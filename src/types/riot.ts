// Account API Types
export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

// Summoner API Types
export interface Summoner {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

// League API Types
export interface LeagueEntry {
  leagueId: string;
  summonerId: string;
  queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

// Match API Types
export interface Match {
  metadata: MatchMetadata;
  info: MatchInfo;
}

export interface MatchMetadata {
  dataVersion: string;
  matchId: string;
  participants: string[];
}

export interface MatchInfo {
  gameCreation: number;
  gameDuration: number;
  gameEndTimestamp: number;
  gameId: number;
  gameMode: string;
  gameName: string;
  gameStartTimestamp: number;
  gameType: string;
  gameVersion: string;
  mapId: number;
  participants: Participant[];
  platformId: string;
  queueId: number;
  teams: Team[];
  tournamentCode?: string;
  // Additional fields for deep analytics
  endOfGameResult?: string; // 'GameComplete', 'Surrender', etc.
}

// Challenges DTO - 100+ fields for deep analytics
export interface Challenges {
  '12AssistStreakCount'?: number;
  abilityUses?: number;
  acesBefore15Minutes?: number;
  alliedJungleMonsterKills?: number;
  baronBuffGoldAdvantageOverThreshold?: number;
  baronTakedowns?: number;
  blastConeOppositeOpponentCount?: number;
  bountyGold?: number;
  buffsStolen?: number;
  completeSupportQuestInTime?: number;
  controlWardTimeCoverageInRiverOrEnemyHalf?: number;
  controlWardsPlaced?: number;
  damagePerMinute?: number;
  damageTakenOnTeamPercentage?: number;
  dancedWithRiftHerald?: number;
  deathsByEnemyChamps?: number;
  dodgeSkillShotsSmallWindow?: number;
  doubleAces?: number;
  dragonTakedowns?: number;
  earliestBaron?: number;
  earliestDragonTakedown?: number;
  earlyLaningPhaseGoldExpAdvantage?: number;
  effectiveHealAndShielding?: number;
  elderDragonKillsWithOpposingSoul?: number;
  elderDragonMultikills?: number;
  enemyChampionImmobilizations?: number;
  enemyJungleMonsterKills?: number;
  epicMonsterKillsNearEnemyJungler?: number;
  epicMonsterKillsWithin30SecondsOfSpawn?: number;
  epicMonsterSteals?: number;
  epicMonsterStolenWithoutSmite?: number;
  firstTurretKilled?: number;
  firstTurretKilledTime?: number;
  flawlessAces?: number;
  fullTeamTakedown?: number;
  gameLength?: number;
  getTakedownsInAllLanesEarlyJungleAsLaner?: number;
  goldPerMinute?: number;
  hadOpenNexus?: number;
  highestChampionDamage?: number;
  highestCrowdControlScore?: number;
  highestWardKills?: number;
  immobilizeAndKillWithAlly?: number;
  initialBuffCount?: number;
  initialCrabCount?: number;
  jungleCsBefore10Minutes?: number;
  junglerKillsEarlyJungle?: number;
  junglerTakedownsNearDamagedEpicMonster?: number;
  kTurretsDestroyedBeforePlatesFall?: number;
  kda?: number;
  killAfterHiddenWithAlly?: number;
  killParticipation?: number;
  killedChampTookFullTeamDamageSurvived?: number;
  killingSprees?: number;
  killsNearEnemyTurret?: number;
  killsOnLanersEarlyJungleAsJungler?: number;
  killsOnOtherLanesEarlyJungleAsLaner?: number;
  killsOnRecentlyHealedByAramPack?: number;
  killsUnderOwnTurret?: number;
  killsWithHelpFromEpicMonster?: number;
  knockEnemyIntoTeamAndKill?: number;
  landSkillShotsEarlyGame?: number;
  laneMinionsFirst10Minutes?: number;
  laningPhaseGoldExpAdvantage?: number;
  legendaryCount?: number;
  legendaryItemUsed?: number[];
  lostAnInhibitor?: number;
  maxCsAdvantageOnLaneOpponent?: number;
  maxKillDeficit?: number;
  maxLevelLeadLaneOpponent?: number;
  mejaisFullStackInTime?: number;
  moreEnemyJungleThanOpponent?: number;
  multiKillOneSpell?: number;
  multiTurretRiftHeraldCount?: number;
  multikills?: number;
  multikillsAfterAggressiveFlash?: number;
  mythicItemUsed?: number;
  outerTurretExecutesBefore10Minutes?: number;
  outnumberedKills?: number;
  outnumberedNexusKill?: number;
  perfectDragonSoulsTaken?: number;
  perfectGame?: number;
  pickKillWithAlly?: number;
  playedChampSelectPosition?: number;
  poroExplosions?: number;
  quickCleanse?: number;
  quickFirstTurret?: number;
  quickSoloKills?: number;
  riftHeraldTakedowns?: number;
  saveAllyFromDeath?: number;
  scuttleCrabKills?: number;
  shortestTimeToAceFromFirstTakedown?: number;
  skillshotsDodged?: number;
  skillshotsHit?: number;
  snowballsHit?: number;
  soloBaronKills?: number;
  soloKills?: number;
  soloTurretsLategame?: number;
  stealthWardsPlaced?: number;
  survivedSingleDigitHpCount?: number;
  survivedThreeImmobilizesInFight?: number;
  takedownOnFirstTurret?: number;
  takedowns?: number;
  takedownsAfterGainingLevelAdvantage?: number;
  takedownsBeforeJungleMinionSpawn?: number;
  takedownsFirstXMinutes?: number;
  takedownsInAlcove?: number;
  takedownsInEnemyFountain?: number;
  teamBaronKills?: number;
  teamDamagePercentage?: number;
  teamElderDragonKills?: number;
  teamRiftHeraldKills?: number;
  threeWardsOneSweeperCount?: number;
  tookLargeDamageSurvived?: number;
  turretPlatesTaken?: number;
  turretTakedowns?: number;
  turretsTakenWithRiftHerald?: number;
  twentyMinionsIn3SecondsCount?: number;
  twoWardsOneSweeperCount?: number;
  unseenRecalls?: number;
  visionScoreAdvantageLaneOpponent?: number;
  visionScorePerMinute?: number;
  wardTakedowns?: number;
  wardTakedownsBefore20M?: number;
  wardsGuarded?: number;
  // ARAM specific
  InfernalScalePickup?: number;
  fistBumpParticipation?: number;
  voidMonsterKill?: number;
  // Arena specific
  SWARM_DefeatAatrox?: number;
  SWARM_DefeatBriar?: number;
  SWARM_DefeatMiniBosses?: number;
  SWARM_EvolveWeapon?: number;
  SWARM_Have3Passives?: number;
  SWARM_KillEnemy?: number;
  SWARM_PickupGold?: number;
  SWARM_ReachLevel50?: number;
  SWARM_Survive15Min?: number;
  SWARM_WinWith5EvolvedWeapons?: number;
}

export interface Participant {
  // Basic info
  assists: number;
  baronKills: number;
  bountyLevel: number;
  champExperience: number;
  champLevel: number;
  championId: number;
  championName: string;
  championTransform?: number; // Kayn transformation
  consumablesPurchased?: number;

  // Damage dealt
  damageDealtToBuildings: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  damageSelfMitigated: number;
  magicDamageDealt: number;
  magicDamageDealtToChampions: number;
  physicalDamageDealt: number;
  physicalDamageDealtToChampions: number;
  trueDamageDealt: number;
  trueDamageDealtToChampions: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageShieldedOnTeammates: number;
  largestCriticalStrike: number;

  // Damage taken
  magicDamageTaken: number;
  physicalDamageTaken: number;
  trueDamageTaken: number;
  totalDamageTaken: number;

  // Kills & deaths
  deaths: number;
  kills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  unrealKills: number; // Hexakill+
  killingSprees: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;

  // First blood / tower
  firstBloodAssist: boolean;
  firstBloodKill: boolean;
  firstTowerAssist: boolean;
  firstTowerKill: boolean;

  // Gold
  goldEarned: number;
  goldSpent: number;

  // Position & role
  individualPosition: string;
  lane: string;
  role: string;
  teamPosition: string;

  // Structures
  inhibitorKills: number;
  inhibitorTakedowns: number;
  inhibitorsLost: number;
  nexusKills: number;
  nexusLost: number;
  nexusTakedowns: number;
  turretKills: number;
  turretTakedowns: number;
  turretsLost: number;

  // Items
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  itemsPurchased: number;

  // CS & jungle
  neutralMinionsKilled: number;
  totalMinionsKilled: number;
  totalAllyJungleMinionsKilled?: number;
  totalEnemyJungleMinionsKilled?: number;

  // Objectives
  dragonKills: number;
  objectivesStolen: number;
  objectivesStolenAssists: number;

  // Participant info
  participantId: number;
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  summonerId: string;
  summonerLevel: number;
  summonerName: string;
  profileIcon?: number;

  // Perks (runes)
  perks: Perks;

  // Spells
  spell1Casts: number;
  spell2Casts: number;
  spell3Casts: number;
  spell4Casts: number;
  summoner1Casts: number;
  summoner1Id: number;
  summoner2Casts: number;
  summoner2Id: number;

  // Team
  teamEarlySurrendered: boolean;
  teamId: number;

  // CC & time
  timeCCingOthers: number;
  timePlayed: number;
  totalTimeCCDealt: number;
  totalTimeSpentDead: number;

  // Healing
  totalHeal: number;
  totalHealsOnTeammates: number;
  totalUnitsHealed: number;

  // Vision
  visionScore: number;
  visionWardsBoughtInGame: number;
  sightWardsBoughtInGame: number;
  wardsKilled: number;
  wardsPlaced: number;
  detectorWardsPlaced?: number;

  // Game outcome
  win: boolean;
  gameEndedInEarlySurrender?: boolean;
  gameEndedInSurrender?: boolean;
  eligibleForProgression?: boolean;

  // CHALLENGES - Deep analytics (100+ metrics)
  challenges?: Challenges;

  // PINGS - Communication analytics
  allInPings?: number;
  assistMePings?: number;
  baitPings?: number;
  basicPings?: number;
  commandPings?: number;
  dangerPings?: number;
  enemyMissingPings?: number;
  enemyVisionPings?: number;
  getBackPings?: number;
  holdPings?: number;
  needVisionPings?: number;
  onMyWayPings?: number;
  pushPings?: number;
  visionClearedPings?: number;

  // MISSIONS - Score tracking
  playerScore0?: number;
  playerScore1?: number;
  playerScore2?: number;
  playerScore3?: number;
  playerScore4?: number;
  playerScore5?: number;
  playerScore6?: number;
  playerScore7?: number;
  playerScore8?: number;
  playerScore9?: number;
  playerScore10?: number;
  playerScore11?: number;

  // Arena/SWARM augments
  playerAugment1?: number;
  playerAugment2?: number;
  playerAugment3?: number;
  playerAugment4?: number;
  playerAugment5?: number;
  playerAugment6?: number;
  playerSubteamId?: number;
  subteamPlacement?: number;

  // Placement (TFT-like modes)
  placement?: number;
}

export interface Perks {
  statPerks: StatPerks;
  styles: PerkStyle[];
}

export interface StatPerks {
  defense: number;
  flex: number;
  offense: number;
}

export interface PerkStyle {
  description: string;
  selections: PerkSelection[];
  style: number;
}

export interface PerkSelection {
  perk: number;
  var1: number;
  var2: number;
  var3: number;
}

export interface Team {
  bans: Ban[];
  objectives: Objectives;
  teamId: number;
  win: boolean;
}

export interface Ban {
  championId: number;
  pickTurn: number;
}

export interface Objectives {
  baron: ObjectiveInfo;
  champion: ObjectiveInfo;
  dragon: ObjectiveInfo;
  horde: ObjectiveInfo;
  inhibitor: ObjectiveInfo;
  riftHerald: ObjectiveInfo;
  tower: ObjectiveInfo;
}

export interface ObjectiveInfo {
  first: boolean;
  kills: number;
}

// Champion Mastery API Types
export interface ChampionMastery {
  puuid: string;
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  championPointsSinceLastLevel: number;
  championPointsUntilNextLevel: number;
  tokensEarned: number;
}

// Spectator API Types
export interface CurrentGameInfo {
  gameId: number;
  gameType: string;
  gameStartTime: number;
  mapId: number;
  gameLength: number;
  platformId: string;
  gameMode: string;
  bannedChampions: BannedChampion[];
  gameQueueConfigId: number;
  observers: Observer;
  participants: CurrentGameParticipant[];
}

export interface BannedChampion {
  pickTurn: number;
  championId: number;
  teamId: number;
}

export interface Observer {
  encryptionKey: string;
}

export interface CurrentGameParticipant {
  championId: number;
  perks: CurrentGamePerks;
  profileIconId: number;
  bot: boolean;
  teamId: number;
  summonerName: string;
  summonerId: string;
  puuid: string;
  spell1Id: number;
  spell2Id: number;
  gameCustomizationObjects: GameCustomizationObject[];
  riotId: string;
}

export interface CurrentGamePerks {
  perkIds: number[];
  perkStyle: number;
  perkSubStyle: number;
}

export interface GameCustomizationObject {
  category: string;
  content: string;
}

// Data Dragon Types
export interface Champion {
  id: string;
  key: string;
  name: string;
  title: string;
  image: ChampionImage;
}

export interface ChampionImage {
  full: string;
  sprite: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Match Timeline Types
export interface MatchTimeline {
  metadata: MatchMetadata;
  info: TimelineInfo;
}

export interface TimelineInfo {
  frameInterval: number;
  frames: TimelineFrame[];
  participants: TimelineParticipantInfo[];
}

export interface TimelineParticipantInfo {
  participantId: number;
  puuid: string;
}

export interface TimelineFrame {
  events: TimelineEvent[];
  participantFrames: Record<string, ParticipantFrame>;
  timestamp: number;
}

export interface ParticipantFrame {
  championStats: ParticipantChampionStats;
  currentGold: number;
  damageStats: DamageStats;
  goldPerSecond: number;
  jungleMinionsKilled: number;
  level: number;
  minionsKilled: number;
  participantId: number;
  position: Position;
  timeEnemySpentControlled: number;
  totalGold: number;
  xp: number;
}

export interface ParticipantChampionStats {
  abilityHaste: number;
  abilityPower: number;
  armor: number;
  armorPen: number;
  armorPenPercent: number;
  attackDamage: number;
  attackSpeed: number;
  bonusArmorPenPercent: number;
  bonusMagicPenPercent: number;
  ccReduction: number;
  cooldownReduction: number;
  health: number;
  healthMax: number;
  healthRegen: number;
  lifesteal: number;
  magicPen: number;
  magicPenPercent: number;
  magicResist: number;
  movementSpeed: number;
  omnivamp: number;
  physicalVamp: number;
  power: number;
  powerMax: number;
  powerRegen: number;
  spellVamp: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface DamageStats {
  magicDamageDone: number;
  magicDamageDoneToChampions: number;
  magicDamageTaken: number;
  physicalDamageDone: number;
  physicalDamageDoneToChampions: number;
  physicalDamageTaken: number;
  totalDamageDone: number;
  totalDamageDoneToChampions: number;
  totalDamageTaken: number;
  trueDamageDone: number;
  trueDamageDoneToChampions: number;
  trueDamageTaken: number;
}

export interface TimelineEvent {
  type: string;
  timestamp: number;
  participantId?: number;
  killerId?: number;
  killerTeamId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  position?: Position;
  wardType?: string;
  creatorId?: number;
  buildingType?: string;
  laneType?: string;
  teamId?: number;
  towerType?: string;
  monsterType?: string;
  monsterSubType?: string;
  skillSlot?: number;
  levelUpType?: string;
  itemId?: number;
  afterId?: number;
  beforeId?: number;
  goldGain?: number;
  bounty?: number;
  shutdownBounty?: number;
}

// App-specific combined types
export interface SummonerProfile {
  account: RiotAccount;
  summoner: Summoner;
  ranks: LeagueEntry[];
  masteries: ChampionMastery[];
}

export interface MatchSummary {
  matchId: string;
  queueId: number;
  gameCreation: number;
  gameDuration: number;
  gameMode: string;
  participant: Participant;
  win: boolean;
  // Full match data for expanded view
  allParticipants: Participant[];
  teams: Team[];
  // Timeline data for gold graph
  timeline?: TimelineFrame[];
}

export interface ChampionStats {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCs: number;
  winRate: number;
  kda: number;
}
