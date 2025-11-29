import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { summoners, ranks, playerMatches, matches } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  getChallengerLeague,
  getGrandmasterLeague,
  getMasterLeague,
  getMatchIds,
  getMatch,
  getSummonerByPuuid,
  getAccountByPuuid,
} from '@/lib/riot-api';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';

// Scrape high elo players and their matches
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = (searchParams.get('region') || 'EUW1') as RegionKey;
    const maxPlayers = parseInt(searchParams.get('maxPlayers') || '50');
    const matchesPerPlayer = parseInt(searchParams.get('matchesPerPlayer') || '10');
    const tier = searchParams.get('tier') || 'all'; // challenger, grandmaster, master, or all

    if (!REGIONS[region]) {
      return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
    }

    console.log(`Starting high elo scrape for ${region}, max ${maxPlayers} players, ${matchesPerPlayer} matches each`);

    // Collect players from different tiers
    const players: Array<{
      puuid: string;
      summonerId: string;
      tier: string;
      rank: string;
      leaguePoints: number;
      wins: number;
      losses: number;
    }> = [];

    // Fetch leagues based on tier parameter
    if (tier === 'all' || tier === 'challenger') {
      try {
        const challenger = await getChallengerLeague(region);
        console.log(`Found ${challenger.entries.length} Challenger players`);
        players.push(...challenger.entries.map(e => ({
          puuid: e.puuid,
          summonerId: e.summonerId,
          tier: 'CHALLENGER',
          rank: 'I',
          leaguePoints: e.leaguePoints,
          wins: e.wins,
          losses: e.losses,
        })));
      } catch (e) {
        console.warn('Failed to fetch Challenger league:', e);
      }
    }

    if (tier === 'all' || tier === 'grandmaster') {
      try {
        const grandmaster = await getGrandmasterLeague(region);
        console.log(`Found ${grandmaster.entries.length} Grandmaster players`);
        players.push(...grandmaster.entries.map(e => ({
          puuid: e.puuid,
          summonerId: e.summonerId,
          tier: 'GRANDMASTER',
          rank: 'I',
          leaguePoints: e.leaguePoints,
          wins: e.wins,
          losses: e.losses,
        })));
      } catch (e) {
        console.warn('Failed to fetch Grandmaster league:', e);
      }
    }

    if (tier === 'all' || tier === 'master') {
      try {
        const master = await getMasterLeague(region);
        console.log(`Found ${master.entries.length} Master players`);
        players.push(...master.entries.map(e => ({
          puuid: e.puuid,
          summonerId: e.summonerId,
          tier: 'MASTER',
          rank: 'I',
          leaguePoints: e.leaguePoints,
          wins: e.wins,
          losses: e.losses,
        })));
      } catch (e) {
        console.warn('Failed to fetch Master league:', e);
      }
    }

    // Sort by LP and take top players
    players.sort((a, b) => b.leaguePoints - a.leaguePoints);
    const selectedPlayers = players.slice(0, maxPlayers);

    console.log(`Selected ${selectedPlayers.length} players to scrape`);

    let playersProcessed = 0;
    let matchesStored = 0;
    let ranksStored = 0;
    let summonersStored = 0;
    const errors: string[] = [];

    for (const player of selectedPlayers) {
      try {
        // Store rank
        await db
          .insert(ranks)
          .values({
            puuid: player.puuid,
            queueType: 'RANKED_SOLO_5x5',
            tier: player.tier,
            rank: player.rank,
            leaguePoints: player.leaguePoints,
            wins: player.wins,
            losses: player.losses,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [ranks.puuid, ranks.queueType],
            set: {
              tier: player.tier,
              rank: player.rank,
              leaguePoints: player.leaguePoints,
              wins: player.wins,
              losses: player.losses,
              updatedAt: new Date(),
            },
          });
        ranksStored++;

        // Fetch and store summoner info for search suggestions
        try {
          const [account, summoner] = await Promise.all([
            getAccountByPuuid(player.puuid, region),
            getSummonerByPuuid(player.puuid, region),
          ]);

          // Use summoner.id, player.summonerId, or puuid as fallback
          const finalSummonerId = summoner.id || player.summonerId || player.puuid;

          await db
            .insert(summoners)
            .values({
              puuid: player.puuid,
              gameName: account.gameName,
              tagLine: account.tagLine,
              region: region,
              summonerId: finalSummonerId,
              profileIconId: summoner.profileIconId,
              summonerLevel: summoner.summonerLevel,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: summoners.puuid,
              set: {
                gameName: account.gameName,
                tagLine: account.tagLine,
                region: region,
                summonerId: finalSummonerId,
                profileIconId: summoner.profileIconId,
                summonerLevel: summoner.summonerLevel,
                updatedAt: new Date(),
              },
            });
          summonersStored++;
        } catch (summonerError) {
          console.warn(`Failed to fetch summoner info for ${player.puuid}:`, summonerError);
        }

        // Fetch recent ranked matches
        const matchIds = await getMatchIds(player.puuid, region, {
          count: matchesPerPlayer,
          queue: 420, // Ranked Solo
        });

        for (const matchId of matchIds) {
          try {
            // Check if match already exists
            const existing = await db.query.matches.findFirst({
              where: eq(matches.matchId, matchId),
            });

            if (existing) {
              continue; // Skip already stored matches
            }

            // Fetch and store match
            const match = await getMatch(matchId, region);

            // Find participant data
            const participant = match.info.participants.find(p => p.puuid === player.puuid);
            if (!participant) continue;

            const gameDuration = match.info.gameDuration;
            const minutes = gameDuration / 60;

            // Store match
            await db
              .insert(matches)
              .values({
                matchId: match.metadata.matchId,
                gameCreation: match.info.gameCreation,
                gameDuration: gameDuration,
                gameMode: match.info.gameMode,
                queueId: match.info.queueId,
                gameVersion: match.info.gameVersion,
                mapId: match.info.mapId,
                platformId: match.info.platformId,
                participants: JSON.stringify(match.info.participants),
                teams: JSON.stringify(match.info.teams),
                updatedAt: new Date(),
              })
              .onConflictDoNothing();

            // Store player match data for ALL participants (more data!)
            for (const p of match.info.participants) {
              const pMinutes = gameDuration / 60;
              const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
              const kda = p.deaths === 0
                ? (p.kills + p.assists) * 1.5
                : (p.kills + p.assists) / p.deaths;

              const teamKills = match.info.participants
                .filter(tp => tp.teamId === p.teamId)
                .reduce((sum, tp) => sum + tp.kills, 0);
              const teamDamage = match.info.participants
                .filter(tp => tp.teamId === p.teamId)
                .reduce((sum, tp) => sum + tp.totalDamageDealtToChampions, 0);

              const killParticipation = teamKills > 0
                ? Math.round(((p.kills + p.assists) / teamKills) * 100)
                : 0;
              const damageShare = teamDamage > 0
                ? Math.round((p.totalDamageDealtToChampions / teamDamage) * 100)
                : 0;

              await db
                .insert(playerMatches)
                .values({
                  puuid: p.puuid,
                  matchId: match.metadata.matchId,
                  win: p.win,
                  championId: p.championId,
                  championName: p.championName,
                  kills: p.kills,
                  deaths: p.deaths,
                  assists: p.assists,
                  cs: cs,
                  visionScore: p.visionScore,
                  teamPosition: p.teamPosition || p.individualPosition || null,
                  goldEarned: p.goldEarned,
                  totalDamageDealtToChampions: p.totalDamageDealtToChampions,
                  totalDamageTaken: p.totalDamageTaken,
                  totalHeal: p.totalHeal,
                  wardsPlaced: p.wardsPlaced,
                  wardsKilled: p.wardsKilled,
                  controlWardsPlaced: p.detectorWardsPlaced,
                  doubleKills: p.doubleKills,
                  tripleKills: p.tripleKills,
                  quadraKills: p.quadraKills,
                  pentaKills: p.pentaKills,
                  firstBloodKill: p.firstBloodKill,
                  damagePerMinute: Math.round((p.totalDamageDealtToChampions / pMinutes) * 100),
                  goldPerMinute: Math.round(p.goldEarned / pMinutes),
                  kda: Math.round(kda * 100),
                  killParticipation: killParticipation,
                  teamDamagePercentage: damageShare,
                  visionScorePerMinute: Math.round((p.visionScore / pMinutes) * 100),
                  soloKills: p.challenges?.soloKills || null,
                  skillshotsDodged: p.challenges?.skillshotsDodged || null,
                  skillshotsHit: p.challenges?.skillshotsHit || null,
                  timePlayed: gameDuration,
                  totalTimeSpentDead: p.totalTimeSpentDead,
                  item0: p.item0,
                  item1: p.item1,
                  item2: p.item2,
                  item3: p.item3,
                  item4: p.item4,
                  item5: p.item5,
                  item6: p.item6,
                  summoner1Id: p.summoner1Id,
                  summoner2Id: p.summoner2Id,
                  primaryRune: p.perks?.styles?.[0]?.selections?.[0]?.perk || null,
                  secondaryRune: p.perks?.styles?.[1]?.style || null,
                  queueId: match.info.queueId,
                  gameVersion: match.info.gameVersion,
                  createdAt: new Date(match.info.gameCreation),
                })
                .onConflictDoNothing();
            }

            matchesStored++;

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
          } catch (matchError) {
            console.warn(`Failed to process match ${matchId}:`, matchError);
          }
        }

        playersProcessed++;
        console.log(`Processed player ${playersProcessed}/${selectedPlayers.length} (${player.tier})`);

        // Delay between players
        await new Promise(r => setTimeout(r, 200));
      } catch (playerError) {
        const errorMsg = `Failed to process player ${player.puuid}: ${playerError}`;
        console.warn(errorMsg);
        errors.push(errorMsg);
      }
    }

    return NextResponse.json({
      message: `Scraping complete`,
      region,
      playersProcessed,
      ranksStored,
      summonersStored,
      matchesStored,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error('Scrape high elo error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape high elo players' },
      { status: 500 }
    );
  }
}
