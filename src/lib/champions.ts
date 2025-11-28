import { getDdragonVersion } from './riot-api';

interface ChampionData {
  id: string; // Internal name (e.g., "MissFortune")
  key: string; // Champion ID as string (e.g., "21")
  name: string; // Display name (e.g., "Miss Fortune")
}

let championMapPromise: Promise<Map<number, ChampionData>> | null = null;

async function fetchChampionMap(): Promise<Map<number, ChampionData>> {
  const version = await getDdragonVersion();
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`;

  const response = await fetch(url, {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  const data = await response.json();
  const map = new Map<number, ChampionData>();

  for (const champion of Object.values(data.data) as ChampionData[]) {
    map.set(parseInt(champion.key, 10), champion);
  }

  return map;
}

export async function getChampionMap(): Promise<Map<number, ChampionData>> {
  if (!championMapPromise) {
    championMapPromise = fetchChampionMap();
  }
  return championMapPromise;
}

export async function getChampionById(championId: number): Promise<ChampionData | undefined> {
  const map = await getChampionMap();
  return map.get(championId);
}

export async function getChampionNameById(championId: number): Promise<string> {
  const champion = await getChampionById(championId);
  return champion?.id || `Champion${championId}`;
}
