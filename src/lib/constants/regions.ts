export type RegionKey = keyof typeof REGIONS;

export const REGIONS = {
  // Europe
  euw: { platform: 'euw1', region: 'europe', name: 'Europe West', shortName: 'EUW' },
  eune: { platform: 'eun1', region: 'europe', name: 'Europe Nordic & East', shortName: 'EUNE' },
  tr: { platform: 'tr1', region: 'europe', name: 'Turkey', shortName: 'TR' },
  ru: { platform: 'ru', region: 'europe', name: 'Russia', shortName: 'RU' },

  // Americas
  na: { platform: 'na1', region: 'americas', name: 'North America', shortName: 'NA' },
  br: { platform: 'br1', region: 'americas', name: 'Brazil', shortName: 'BR' },
  lan: { platform: 'la1', region: 'americas', name: 'Latin America North', shortName: 'LAN' },
  las: { platform: 'la2', region: 'americas', name: 'Latin America South', shortName: 'LAS' },

  // Asia
  kr: { platform: 'kr', region: 'asia', name: 'Korea', shortName: 'KR' },
  jp: { platform: 'jp1', region: 'asia', name: 'Japan', shortName: 'JP' },

  // SEA (South East Asia)
  oce: { platform: 'oc1', region: 'sea', name: 'Oceania', shortName: 'OCE' },
  ph: { platform: 'ph2', region: 'sea', name: 'Philippines', shortName: 'PH' },
  sg: { platform: 'sg2', region: 'sea', name: 'Singapore', shortName: 'SG' },
  th: { platform: 'th2', region: 'sea', name: 'Thailand', shortName: 'TH' },
  tw: { platform: 'tw2', region: 'sea', name: 'Taiwan', shortName: 'TW' },
  vn: { platform: 'vn2', region: 'sea', name: 'Vietnam', shortName: 'VN' },
} as const;

export const REGION_LIST = Object.entries(REGIONS).map(([key, value]) => ({
  key: key as RegionKey,
  ...value,
}));

export const REGION_GROUPS = {
  europe: ['euw', 'eune', 'tr', 'ru'] as RegionKey[],
  americas: ['na', 'br', 'lan', 'las'] as RegionKey[],
  asia: ['kr', 'jp'] as RegionKey[],
  sea: ['oce', 'ph', 'sg', 'th', 'tw', 'vn'] as RegionKey[],
};

export function getRegion(key: string): typeof REGIONS[RegionKey] | undefined {
  return REGIONS[key as RegionKey];
}

export function getPlatformHost(region: RegionKey): string {
  return `${REGIONS[region].platform}.api.riotgames.com`;
}

export function getRegionalHost(region: RegionKey): string {
  return `${REGIONS[region].region}.api.riotgames.com`;
}
