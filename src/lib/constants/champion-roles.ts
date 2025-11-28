import { getAllLocalChampionPositionRates } from '@/lib/cache';

// Cache for all rates from our DB
let allRatesCache: Record<number, Record<string, number>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Cache for Community Dragon champion data
let cdragonCache: Map<number, string[]> | null = null;
let cdragonFetchPromise: Promise<Map<number, string[]>> | null = null;

// Map champion class/role to likely lane positions
const CLASS_TO_POSITIONS: Record<string, string[]> = {
  marksman: ['BOTTOM'],
  support: ['UTILITY'],
  mage: ['MIDDLE', 'UTILITY'],
  assassin: ['MIDDLE', 'JUNGLE'],
  fighter: ['TOP', 'JUNGLE'],
  tank: ['TOP', 'JUNGLE', 'UTILITY'],
  specialist: ['TOP', 'MIDDLE'],
};

// Fetch champion roles from Community Dragon (dynamic, reliable API)
async function fetchCDragonChampionRoles(): Promise<Map<number, string[]>> {
  try {
    const response = await fetch(
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json',
      { next: { revalidate: 86400 } } // Cache for 24 hours
    );

    if (!response.ok) {
      throw new Error('Failed to fetch Community Dragon data');
    }

    const champions: Array<{ id: number; roles: string[] }> = await response.json();
    const roleMap = new Map<number, string[]>();

    for (const champ of champions) {
      if (champ.id === -1) continue; // Skip "None" champion

      // Convert champion roles (mage, fighter, etc.) to lane positions
      const positions = new Set<string>();
      for (const role of champ.roles || []) {
        const mappedPositions = CLASS_TO_POSITIONS[role.toLowerCase()];
        if (mappedPositions) {
          mappedPositions.forEach((p) => positions.add(p));
        }
      }

      if (positions.size > 0) {
        roleMap.set(champ.id, Array.from(positions));
      }
    }

    return roleMap;
  } catch (error) {
    console.warn('Failed to fetch Community Dragon champion data:', error);
    return new Map();
  }
}

// Get Community Dragon roles with caching
async function getCDragonRoles(): Promise<Map<number, string[]>> {
  if (cdragonCache) {
    return cdragonCache;
  }

  if (!cdragonFetchPromise) {
    cdragonFetchPromise = fetchCDragonChampionRoles().then((roles) => {
      cdragonCache = roles;
      return roles;
    });
  }

  return cdragonFetchPromise;
}

// Get all champion rates from our DB with caching
async function getAllChampionRates(): Promise<Record<number, Record<string, number>>> {
  const now = Date.now();

  if (allRatesCache && now - cacheTimestamp < CACHE_TTL) {
    return allRatesCache;
  }

  try {
    allRatesCache = await getAllLocalChampionPositionRates();
    cacheTimestamp = now;
    return allRatesCache;
  } catch (e) {
    console.warn('Failed to fetch local champion rates:', e);
    return allRatesCache || {};
  }
}

// Get role play rates for a champion
// Priority: Local DB > Community Dragon fallback
export async function getChampionRoleRates(championId: number): Promise<Record<string, number>> {
  // Try local DB first (our own aggregated data)
  const allRates = await getAllChampionRates();
  const localRates = allRates[championId];

  if (localRates && Object.keys(localRates).length > 0) {
    return localRates;
  }

  // Fallback to Community Dragon (dynamic API)
  const cdragonRoles = await getCDragonRoles();
  const positions = cdragonRoles.get(championId);

  if (positions && positions.length > 0) {
    // Equal probability for each position from CDragon
    const rate = 1 / positions.length;
    const rates: Record<string, number> = {};
    for (const pos of positions) {
      rates[pos] = rate;
    }
    return rates;
  }

  // No data available
  return {};
}

// Get primary role for a champion (highest playRate position)
export async function getChampionPrimaryRole(championId: number): Promise<string | null> {
  const rates = await getChampionRoleRates(championId);

  let highestRate = 0;
  let primaryRole: string | null = null;

  for (const [role, rate] of Object.entries(rates)) {
    if (rate > highestRate) {
      highestRate = rate;
      primaryRole = role;
    }
  }

  return primaryRole;
}

// Assign optimal roles for a team of 5 players
// Uses greedy algorithm to maximize total probability
export async function assignTeamRoles(
  players: Array<{ championId: number; spell1Id: number; spell2Id: number; index: number }>
): Promise<Map<number, string>> {
  const assignments = new Map<number, string>();
  const availableRoles = new Set(ROLE_ORDER as readonly string[]);

  // First, assign junglers (players with Smite)
  for (const player of players) {
    if (player.spell1Id === SUMMONER_SPELLS.SMITE || player.spell2Id === SUMMONER_SPELLS.SMITE) {
      assignments.set(player.index, 'JUNGLE');
      availableRoles.delete('JUNGLE');
    }
  }

  // Get play rates for remaining players
  const remainingPlayers = players.filter((p) => !assignments.has(p.index));

  // Fetch all role rates in parallel
  const playerRates = await Promise.all(
    remainingPlayers.map(async (player) => ({
      index: player.index,
      championId: player.championId,
      rates: await getChampionRoleRates(player.championId),
    }))
  );

  // Greedy assignment: repeatedly assign the highest probability (player, role) pair
  while (playerRates.length > 0 && availableRoles.size > 0) {
    let bestPlayer = -1;
    let bestRole = '';
    let bestRate = -1;

    for (let i = 0; i < playerRates.length; i++) {
      const player = playerRates[i];
      for (const role of availableRoles) {
        const rate = player.rates[role] || 0;
        if (rate > bestRate) {
          bestRate = rate;
          bestPlayer = i;
          bestRole = role;
        }
      }
    }

    if (bestPlayer === -1) {
      // No valid assignment found, assign remaining players to remaining roles
      for (const player of playerRates) {
        if (!assignments.has(player.index)) {
          const remainingRole = Array.from(availableRoles)[0];
          if (remainingRole) {
            assignments.set(player.index, remainingRole);
            availableRoles.delete(remainingRole);
          }
        }
      }
      break;
    }

    // Assign best match
    assignments.set(playerRates[bestPlayer].index, bestRole);
    availableRoles.delete(bestRole);
    playerRates.splice(bestPlayer, 1);
  }

  return assignments;
}

// Summoner spell IDs
export const SUMMONER_SPELLS = {
  SMITE: 11,
  FLASH: 4,
  HEAL: 7,
  EXHAUST: 3,
  BARRIER: 21,
  IGNITE: 14,
  TELEPORT: 12,
  CLEANSE: 1,
  GHOST: 6,
} as const;

// Role order for display
export const ROLE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

export type Role = (typeof ROLE_ORDER)[number];

export async function detectRole(
  championId: number,
  spell1Id: number,
  spell2Id: number
): Promise<Role> {
  // If has Smite, it's jungle
  if (spell1Id === SUMMONER_SPELLS.SMITE || spell2Id === SUMMONER_SPELLS.SMITE) {
    return 'JUNGLE';
  }

  // Get champion's primary role from our data
  const primaryRole = await getChampionPrimaryRole(championId);
  if (primaryRole && ROLE_ORDER.includes(primaryRole as Role)) {
    return primaryRole as Role;
  }

  // Fallback to MIDDLE if no data
  return 'MIDDLE';
}

export function getRoleDisplayName(role: string): string {
  const names: Record<string, string> = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'ADC',
    UTILITY: 'Support',
  };
  return names[role] || role;
}
