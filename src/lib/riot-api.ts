import { REGIONS, type RegionKey, getPlatformHost, getRegionalHost } from './constants/regions';
import type {
  RiotAccount,
  Summoner,
  LeagueEntry,
  Match,
  ChampionMastery,
  CurrentGameInfo,
} from '@/types/riot';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

if (!RIOT_API_KEY) {
  console.warn('Warning: RIOT_API_KEY is not set');
}

class RiotApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'RiotApiError';
  }
}

// Rate limiting queue
const requestQueue: Array<() => void> = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 5;
const REQUEST_DELAY_MS = 50; // Delay between requests

async function processQueue(): Promise<void> {
  if (requestQueue.length === 0 || activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return;
  }

  const next = requestQueue.shift();
  if (next) {
    activeRequests++;
    next();
  }
}

async function queuedFetch(url: string, options: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const executeRequest = async () => {
      try {
        // Add small delay between requests
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        const response = await fetch(url, options);
        resolve(response);
      } catch (error) {
        reject(error);
      } finally {
        activeRequests--;
        processQueue();
      }
    };

    requestQueue.push(executeRequest);
    processQueue();
  });
}

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 1000
): Promise<Response> {
  try {
    const response = await queuedFetch(url, options);

    if (response.status === 429) {
      // Get retry-after header or use exponential backoff
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff;

      if (retries > 0) {
        console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

async function fetchRiotApi<T>(url: string): Promise<T> {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        'X-Riot-Token': RIOT_API_KEY || '',
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    },
    3,
    1000
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new RiotApiError(404, 'Not found');
    }
    if (response.status === 429) {
      throw new RiotApiError(429, 'Rate limited');
    }
    throw new RiotApiError(response.status, `API error: ${response.statusText}`);
  }

  return response.json();
}

// Account API
export async function getAccountByRiotId(
  gameName: string,
  tagLine: string,
  region: RegionKey
): Promise<RiotAccount> {
  const host = getRegionalHost(region);
  const url = `https://${host}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return fetchRiotApi<RiotAccount>(url);
}

export async function getAccountByPuuid(puuid: string, region: RegionKey): Promise<RiotAccount> {
  const host = getRegionalHost(region);
  const url = `https://${host}/riot/account/v1/accounts/by-puuid/${puuid}`;
  return fetchRiotApi<RiotAccount>(url);
}

// Summoner API
export async function getSummonerByPuuid(puuid: string, region: RegionKey): Promise<Summoner> {
  const host = getPlatformHost(region);
  const url = `https://${host}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  return fetchRiotApi<Summoner>(url);
}

// League API
export async function getLeagueEntries(summonerId: string, region: RegionKey): Promise<LeagueEntry[]> {
  const host = getPlatformHost(region);
  const url = `https://${host}/lol/league/v4/entries/by-summoner/${summonerId}`;
  return fetchRiotApi<LeagueEntry[]>(url);
}

// League API by PUUID (newer endpoint)
export async function getLeagueEntriesByPuuid(puuid: string, region: RegionKey): Promise<LeagueEntry[]> {
  const host = getPlatformHost(region);
  const url = `https://${host}/lol/league/v4/entries/by-puuid/${puuid}`;
  return fetchRiotApi<LeagueEntry[]>(url);
}

// Match API
export async function getMatchIds(
  puuid: string,
  region: RegionKey,
  options: {
    start?: number;
    count?: number;
    queue?: number;
    type?: string;
  } = {}
): Promise<string[]> {
  const host = getRegionalHost(region);
  const params = new URLSearchParams();
  if (options.start !== undefined) params.set('start', options.start.toString());
  if (options.count !== undefined) params.set('count', options.count.toString());
  if (options.queue !== undefined) params.set('queue', options.queue.toString());
  if (options.type) params.set('type', options.type);

  const url = `https://${host}/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`;
  return fetchRiotApi<string[]>(url);
}

export async function getMatch(matchId: string, region: RegionKey): Promise<Match> {
  const host = getRegionalHost(region);
  const url = `https://${host}/lol/match/v5/matches/${matchId}`;
  return fetchRiotApi<Match>(url);
}

// Champion Mastery API
export async function getChampionMasteries(
  puuid: string,
  region: RegionKey,
  top?: number
): Promise<ChampionMastery[]> {
  const host = getPlatformHost(region);
  const endpoint = top
    ? `https://${host}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${top}`
    : `https://${host}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`;
  return fetchRiotApi<ChampionMastery[]>(endpoint);
}

// Spectator API
export async function getCurrentGame(puuid: string, region: RegionKey): Promise<CurrentGameInfo | null> {
  const host = getPlatformHost(region);
  // Note: Spectator V5 uses "by-summoner" in the path but takes PUUID as parameter
  const url = `https://${host}/lol/spectator/v5/active-games/by-summoner/${puuid}`;
  try {
    return await fetchRiotApi<CurrentGameInfo>(url);
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 404) {
      return null; // Player not in game
    }
    throw error;
  }
}

// Data Dragon URLs - version is fetched dynamically and cached
let cachedDdragonVersion: string | null = null;
let versionFetchPromise: Promise<string> | null = null;

async function fetchLatestDdragonVersion(): Promise<string> {
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    const versions = await response.json();
    return versions[0]; // First version is the latest
  } catch {
    return '15.1.1'; // Fallback version
  }
}

export async function getDdragonVersion(): Promise<string> {
  if (cachedDdragonVersion) return cachedDdragonVersion;

  if (!versionFetchPromise) {
    versionFetchPromise = fetchLatestDdragonVersion().then(version => {
      cachedDdragonVersion = version;
      return version;
    });
  }

  return versionFetchPromise;
}

// Synchronous version getter for URL functions (uses cache or fallback)
function getDdragonVersionSync(): string {
  return cachedDdragonVersion || '15.1.1';
}

// Initialize version on module load
getDdragonVersion();

export function getChampionIconUrl(championName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${getDdragonVersionSync()}/img/champion/${championName}.png`;
}

export function getProfileIconUrl(iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${getDdragonVersionSync()}/img/profileicon/${iconId}.png`;
}

export function getItemIconUrl(itemId: number): string {
  if (itemId === 0) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${getDdragonVersionSync()}/img/item/${itemId}.png`;
}

export function getSummonerSpellIconUrl(spellId: number): string {
  const spellNames: Record<number, string> = {
    1: 'SummonerBoost',
    3: 'SummonerExhaust',
    4: 'SummonerFlash',
    6: 'SummonerHaste',
    7: 'SummonerHeal',
    11: 'SummonerSmite',
    12: 'SummonerTeleport',
    13: 'SummonerMana',
    14: 'SummonerDot',
    21: 'SummonerBarrier',
    32: 'SummonerSnowball',
  };
  return `https://ddragon.leagueoflegends.com/cdn/${getDdragonVersionSync()}/img/spell/${spellNames[spellId] || 'SummonerFlash'}.png`;
}

export function getRankedEmblemUrl(tier: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.svg`;
}

export function getRoleIconUrl(role: string): string {
  const roleMap: Record<string, string> = {
    TOP: 'top',
    JUNGLE: 'jungle',
    MIDDLE: 'mid',
    BOTTOM: 'bot',
    UTILITY: 'support',
    SUPPORT: 'support',
  };
  const roleName = roleMap[role.toUpperCase()] || 'fill';
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${roleName}.png`;
}

export { RiotApiError };
