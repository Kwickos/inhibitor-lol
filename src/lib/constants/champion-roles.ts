import { getAllLocalChampionPositionRates } from '@/lib/cache';

// Cache for all rates from our DB
let allRatesCache: Record<number, Record<string, number>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Cache for Meraki Analytics champion rates (real pick rates by position)
let merakiRatesCache: Record<number, Record<string, number>> | null = null;
let merakiFetchPromise: Promise<Record<number, Record<string, number>>> | null = null;

// Fetch real champion pick rates from Meraki Analytics
// Format: { "championId": { "TOP": { "playRate": 3.611 }, ... } }
async function fetchMerakiChampionRates(): Promise<Record<number, Record<string, number>>> {
  try {
    const response = await fetch(
      'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json',
      { next: { revalidate: 86400 } } // Cache for 24 hours
    );

    if (!response.ok) {
      throw new Error('Failed to fetch Meraki Analytics data');
    }

    const data: { data: Record<string, Record<string, { playRate: number }>>; patch: string } = await response.json();
    const result: Record<number, Record<string, number>> = {};

    for (const [champIdStr, positions] of Object.entries(data.data)) {
      const champId = parseInt(champIdStr, 10);
      if (isNaN(champId)) continue;

      // Calculate total play rate across all positions for normalization
      let totalPlayRate = 0;
      for (const posData of Object.values(positions)) {
        totalPlayRate += posData.playRate || 0;
      }

      if (totalPlayRate === 0) continue;

      // Normalize to get probability distribution (0-1)
      result[champId] = {};
      for (const [position, posData] of Object.entries(positions)) {
        if (posData.playRate > 0) {
          result[champId][position] = posData.playRate / totalPlayRate;
        }
      }
    }

    return result;
  } catch (error) {
    console.warn('Failed to fetch Meraki Analytics champion rates:', error);
    return {};
  }
}

// Get Meraki rates with caching
async function getMerakiRates(): Promise<Record<number, Record<string, number>>> {
  if (merakiRatesCache) {
    return merakiRatesCache;
  }

  if (!merakiFetchPromise) {
    merakiFetchPromise = fetchMerakiChampionRates().then((rates) => {
      merakiRatesCache = rates;
      return rates;
    });
  }

  return merakiFetchPromise;
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
// Priority: Local DB > Meraki Analytics (real pick rate data)
export async function getChampionRoleRates(championId: number): Promise<Record<string, number>> {
  // Try local DB first (our own aggregated data from matches)
  const allRates = await getAllChampionRates();
  const localRates = allRates[championId];

  if (localRates && Object.keys(localRates).length > 0) {
    return localRates;
  }

  // Fallback to Meraki Analytics (real pick rate data from all ranked games)
  const merakiRates = await getMerakiRates();
  const champRates = merakiRates[championId];

  if (champRates && Object.keys(champRates).length > 0) {
    return champRates;
  }

  // No data available - return empty (will be handled by assignment algorithm)
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

// Generate all permutations of an array
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

// Assign optimal roles for a team of 5 players
// Uses brute-force optimization (5! = 120 permutations) to find the globally optimal assignment
export async function assignTeamRoles(
  players: Array<{ championId: number; spell1Id: number; spell2Id: number; index: number }>
): Promise<Map<number, string>> {
  const assignments = new Map<number, string>();
  let availableRoles = [...ROLE_ORDER] as string[];

  // Pre-fetch all role rates for spell-based detection
  const allPlayerRates = await Promise.all(
    players.map(async (player) => ({
      index: player.index,
      championId: player.championId,
      spell1Id: player.spell1Id,
      spell2Id: player.spell2Id,
      rates: await getChampionRoleRates(player.championId),
    }))
  );

  // First, assign junglers (players with Smite - check all smite variants)
  for (const player of allPlayerRates) {
    const hasSmite = SMITE_IDS.includes(player.spell1Id as typeof SMITE_IDS[number]) ||
                     SMITE_IDS.includes(player.spell2Id as typeof SMITE_IDS[number]);
    if (hasSmite) {
      assignments.set(player.index, 'JUNGLE');
      availableRoles = availableRoles.filter(r => r !== 'JUNGLE');
    }
  }

  // Then, try to detect support (Exhaust + high UTILITY rate)
  // Only assign if the champion has significant support play rate (>30%)
  if (availableRoles.includes('UTILITY')) {
    let bestSupportCandidate: { index: number; rate: number } | null = null;

    for (const player of allPlayerRates) {
      if (assignments.has(player.index)) continue;

      const hasExhaust = player.spell1Id === SUMMONER_SPELLS.EXHAUST ||
                         player.spell2Id === SUMMONER_SPELLS.EXHAUST;
      const utilityRate = player.rates['UTILITY'] || 0;

      // Exhaust + significant UTILITY rate = likely support
      if (hasExhaust && utilityRate > 0.3) {
        if (!bestSupportCandidate || utilityRate > bestSupportCandidate.rate) {
          bestSupportCandidate = { index: player.index, rate: utilityRate };
        }
      }
    }

    if (bestSupportCandidate) {
      assignments.set(bestSupportCandidate.index, 'UTILITY');
      availableRoles = availableRoles.filter(r => r !== 'UTILITY');
    }
  }

  // Get remaining players (not yet assigned)
  const remainingPlayers = allPlayerRates.filter((p) => !assignments.has(p.index));

  if (remainingPlayers.length === 0) {
    return assignments;
  }

  // Use already-fetched rates for remaining players
  const playerRates = remainingPlayers.map(player => ({
    index: player.index,
    championId: player.championId,
    rates: player.rates,
  }));

  // Try all permutations of role assignments to find the optimal one
  // For n players, there are n! permutations (max 120 for 5 players)
  const rolePerms = permutations(availableRoles.slice(0, playerRates.length));

  let bestScore = -1;
  let bestAssignment: Map<number, string> | null = null;

  for (const rolePerm of rolePerms) {
    let score = 0;
    const tempAssignment = new Map<number, string>();

    for (let i = 0; i < playerRates.length; i++) {
      const player = playerRates[i];
      const role = rolePerm[i];
      const rate = player.rates[role] || 0;
      // Use log to handle very small probabilities better and avoid 0 dominating
      // Add small epsilon to avoid log(0)
      score += rate;
      tempAssignment.set(player.index, role);
    }

    if (score > bestScore) {
      bestScore = score;
      bestAssignment = tempAssignment;
    }
  }

  // Apply best assignment
  if (bestAssignment) {
    for (const [index, role] of bestAssignment) {
      assignments.set(index, role);
    }
  } else {
    // Fallback: assign remaining players to remaining roles in order
    for (let i = 0; i < playerRates.length; i++) {
      if (availableRoles[i]) {
        assignments.set(playerRates[i].index, availableRoles[i]);
      }
    }
  }

  return assignments;
}

// Summoner spell IDs
// Note: Smite has multiple IDs (11 = regular, 55 = variant)
export const SUMMONER_SPELLS = {
  SMITE: 11,
  SMITE_VARIANT: 55,
  FLASH: 4,
  HEAL: 7,
  EXHAUST: 3,
  BARRIER: 21,
  IGNITE: 14,
  TELEPORT: 12,
  CLEANSE: 1,
  GHOST: 6,
} as const;

// All smite spell IDs (for jungle detection)
export const SMITE_IDS = [SUMMONER_SPELLS.SMITE, SUMMONER_SPELLS.SMITE_VARIANT] as const;

// Role order for display
export const ROLE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

export type Role = (typeof ROLE_ORDER)[number];

export async function detectRole(
  championId: number,
  spell1Id: number,
  spell2Id: number
): Promise<Role> {
  // If has Smite (any variant), it's jungle
  const hasSmite = SMITE_IDS.includes(spell1Id as typeof SMITE_IDS[number]) ||
                   SMITE_IDS.includes(spell2Id as typeof SMITE_IDS[number]);
  if (hasSmite) {
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
