export const QUEUE_TYPES = {
  420: { name: 'Ranked Solo/Duo', shortName: 'Solo/Duo', type: 'ranked' },
  440: { name: 'Ranked Flex', shortName: 'Flex', type: 'ranked' },
  400: { name: 'Normal Draft', shortName: 'Draft', type: 'normal' },
  430: { name: 'Normal Blind', shortName: 'Blind', type: 'normal' },
  450: { name: 'ARAM', shortName: 'ARAM', type: 'aram' },
  700: { name: 'Clash', shortName: 'Clash', type: 'clash' },
  900: { name: 'URF', shortName: 'URF', type: 'special' },
  1020: { name: 'One for All', shortName: 'OFA', type: 'special' },
  1300: { name: 'Nexus Blitz', shortName: 'NB', type: 'special' },
  1400: { name: 'Ultimate Spellbook', shortName: 'USB', type: 'special' },
  1700: { name: 'Arena', shortName: 'Arena', type: 'arena' },
  1710: { name: 'Arena', shortName: 'Arena', type: 'arena' },
  1900: { name: 'URF', shortName: 'URF', type: 'special' },
  // Swiftplay
  480: { name: 'Swiftplay', shortName: 'Swift', type: 'swiftplay' },
  490: { name: 'Quickplay', shortName: 'Quick', type: 'quickplay' },
} as const;

// Queue filters for match history
export const QUEUE_FILTERS = [
  { id: 'all', label: 'All', queueIds: null },
  { id: 'ranked', label: 'Ranked', queueIds: [420, 440] },
  { id: 'solo', label: 'Solo/Duo', queueIds: [420] },
  { id: 'flex', label: 'Flex', queueIds: [440] },
  { id: 'normal', label: 'Normal', queueIds: [400, 430, 490] },
  { id: 'aram', label: 'ARAM', queueIds: [450] },
  { id: 'arena', label: 'Arena', queueIds: [1700, 1710] },
] as const;

export type QueueFilterId = typeof QUEUE_FILTERS[number]['id'];

// Queue IDs that support game score calculation (5v5 Summoner's Rift modes)
export const SCORE_SUPPORTED_QUEUES = [420, 440, 400, 430, 490, 480, 700] as const;

// Queue IDs that don't support scoring (different game modes)
export const SCORE_UNSUPPORTED_QUEUES = [450, 1700, 1710, 900, 1020, 1300, 1400, 1900] as const;

export type QueueId = keyof typeof QUEUE_TYPES;

export function getQueueInfo(queueId: number) {
  return QUEUE_TYPES[queueId as QueueId] || { name: 'Unknown', shortName: 'Unknown', type: 'unknown' };
}

export const RANKED_QUEUE_TYPES = {
  RANKED_SOLO_5x5: { name: 'Ranked Solo/Duo', shortName: 'Solo/Duo' },
  RANKED_FLEX_SR: { name: 'Ranked Flex', shortName: 'Flex' },
} as const;

export const TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
] as const;

export const DIVISIONS = ['I', 'II', 'III', 'IV'] as const;

export type Tier = typeof TIERS[number];
export type Division = typeof DIVISIONS[number];

export function getTierColor(tier: string): string {
  const colors: Record<string, string> = {
    IRON: '#5e5e5e',
    BRONZE: '#a5642a',
    SILVER: '#7b8b9e',
    GOLD: '#d4a634',
    PLATINUM: '#28a69b',
    EMERALD: '#18a95c',
    DIAMOND: '#576bce',
    MASTER: '#9d4dc3',
    GRANDMASTER: '#cd4545',
    CHALLENGER: '#f4c875',
  };
  return colors[tier] || '#71717a';
}
