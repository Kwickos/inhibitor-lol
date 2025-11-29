import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { summoners } from '@/db/schema';
import { like, or, sql } from 'drizzle-orm';
import { getProfileIconUrl } from '@/lib/riot-api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ players: [] });
  }

  try {
    // Search for players matching the query in gameName or tagLine
    const searchPattern = `%${query}%`;

    const results = await db
      .select({
        puuid: summoners.puuid,
        gameName: summoners.gameName,
        tagLine: summoners.tagLine,
        region: summoners.region,
        profileIconId: summoners.profileIconId,
        summonerLevel: summoners.summonerLevel,
      })
      .from(summoners)
      .where(
        or(
          like(sql`lower(${summoners.gameName})`, searchPattern.toLowerCase()),
          like(sql`lower(${summoners.tagLine})`, searchPattern.toLowerCase()),
          like(
            sql`lower(${summoners.gameName} || '#' || ${summoners.tagLine})`,
            searchPattern.toLowerCase()
          )
        )
      )
      .limit(10);

    // Add profile icon URL to each player
    const players = results.map((player) => ({
      ...player,
      profileIconUrl: getProfileIconUrl(player.profileIconId),
    }));

    return NextResponse.json({ players });
  } catch (error) {
    console.error('Error searching players:', error);
    return NextResponse.json({ players: [] });
  }
}
