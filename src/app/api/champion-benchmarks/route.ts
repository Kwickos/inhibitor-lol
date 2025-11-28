import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playerMatches, matches, championBenchmarks } from '@/db/schema';
import { eq, sql, and, gte, desc } from 'drizzle-orm';

// Aggregate champion benchmarks from our stored match data
// This creates benchmarks per champion/role based on all available data

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minGames = parseInt(searchParams.get('minGames') || '10');

    // Aggregate stats per champion/role from playerMatches
    // We'll use all our data and mark it as "ALL_RANKS" tier
    // Later we can filter by rank when we have that data
    const aggregatedStats = await db
      .select({
        championId: playerMatches.championId,
        championName: playerMatches.championName,
        teamPosition: playerMatches.teamPosition,
        gamesCount: sql<number>`count(*)`.as('games_count'),
        wins: sql<number>`sum(case when ${playerMatches.win} then 1 else 0 end)`.as('wins'),
        // Core stats
        totalKills: sql<number>`sum(${playerMatches.kills})`.as('total_kills'),
        totalDeaths: sql<number>`sum(${playerMatches.deaths})`.as('total_deaths'),
        totalAssists: sql<number>`sum(${playerMatches.assists})`.as('total_assists'),
        // CS & Gold
        totalCs: sql<number>`sum(${playerMatches.cs})`.as('total_cs'),
        totalGoldEarned: sql<number>`sum(${playerMatches.goldEarned})`.as('total_gold'),
        totalTimePlayed: sql<number>`sum(${playerMatches.timePlayed})`.as('total_time'),
        // Damage
        totalDamage: sql<number>`sum(${playerMatches.totalDamageDealtToChampions})`.as('total_damage'),
        // Vision
        totalVisionScore: sql<number>`sum(${playerMatches.visionScore})`.as('total_vision'),
        totalWardsPlaced: sql<number>`sum(${playerMatches.wardsPlaced})`.as('total_wards'),
        totalControlWards: sql<number>`sum(${playerMatches.controlWardsPlaced})`.as('total_control_wards'),
        // Combat (from challenges)
        totalSoloKills: sql<number>`sum(${playerMatches.soloKills})`.as('total_solo_kills'),
        totalSkillshotsHit: sql<number>`sum(${playerMatches.skillshotsHit})`.as('total_skillshots_hit'),
        totalSkillshotsDodged: sql<number>`sum(${playerMatches.skillshotsDodged})`.as('total_skillshots_dodged'),
        // Kill participation & damage share (stored as percentages)
        totalKillParticipation: sql<number>`sum(${playerMatches.killParticipation})`.as('total_kp'),
        totalDamageShare: sql<number>`sum(${playerMatches.teamDamagePercentage})`.as('total_damage_share'),
        // Count non-null values for proper averaging
        kpCount: sql<number>`sum(case when ${playerMatches.killParticipation} is not null then 1 else 0 end)`.as('kp_count'),
        dmgShareCount: sql<number>`sum(case when ${playerMatches.teamDamagePercentage} is not null then 1 else 0 end)`.as('dmg_share_count'),
        soloKillsCount: sql<number>`sum(case when ${playerMatches.soloKills} is not null then 1 else 0 end)`.as('solo_kills_count'),
      })
      .from(playerMatches)
      .where(
        and(
          sql`${playerMatches.teamPosition} IS NOT NULL`,
          sql`${playerMatches.teamPosition} != ''`,
          sql`${playerMatches.timePlayed} > 300` // Only games > 5 min
        )
      )
      .groupBy(playerMatches.championId, playerMatches.championName, playerMatches.teamPosition)
      .having(sql`count(*) >= ${minGames}`);

    console.log(`Found ${aggregatedStats.length} champion/role combinations with >= ${minGames} games`);

    let inserted = 0;
    const now = new Date();

    for (const stats of aggregatedStats) {
      if (!stats.teamPosition) continue;

      const role = normalizeRole(stats.teamPosition);
      if (!role) continue;

      const avgMinutes = stats.totalTimePlayed ? (stats.totalTimePlayed / stats.gamesCount) / 60 : 25;

      // Calculate averages
      const avgKills = stats.totalKills / stats.gamesCount;
      const avgDeaths = stats.totalDeaths / stats.gamesCount;
      const avgAssists = stats.totalAssists / stats.gamesCount;
      const avgKda = avgDeaths === 0 ? avgKills + avgAssists : (avgKills + avgAssists) / avgDeaths;
      const winRate = (stats.wins / stats.gamesCount) * 100;
      const avgCsPerMin = (stats.totalCs / stats.gamesCount) / avgMinutes;
      const avgGoldPerMin = stats.totalGoldEarned ? (stats.totalGoldEarned / stats.gamesCount) / avgMinutes : null;
      const avgDamagePerMin = stats.totalDamage ? (stats.totalDamage / stats.gamesCount) / avgMinutes : null;
      const avgVisionPerMin = stats.totalVisionScore ? (stats.totalVisionScore / stats.gamesCount) / avgMinutes : null;
      const avgWardsPlaced = stats.totalWardsPlaced ? stats.totalWardsPlaced / stats.gamesCount : null;
      const avgControlWards = stats.totalControlWards ? stats.totalControlWards / stats.gamesCount : null;
      const avgSoloKills = stats.soloKillsCount && stats.soloKillsCount > 0 ? stats.totalSoloKills! / stats.soloKillsCount : null;
      const avgKillParticipation = stats.kpCount && stats.kpCount > 0 ? stats.totalKillParticipation! / stats.kpCount : null;
      const avgDamageShare = stats.dmgShareCount && stats.dmgShareCount > 0 ? stats.totalDamageShare! / stats.dmgShareCount : null;
      const avgSkillshotsHit = stats.totalSkillshotsHit ? stats.totalSkillshotsHit / stats.gamesCount : null;
      const avgSkillshotsDodged = stats.totalSkillshotsDodged ? stats.totalSkillshotsDodged / stats.gamesCount : null;

      try {
        await db
          .insert(championBenchmarks)
          .values({
            championId: stats.championId,
            championName: stats.championName,
            role: role,
            tier: 'ALL_RANKS', // Will add HIGH_ELO tier when we have rank data
            gamesAnalyzed: stats.gamesCount,
            avgKills: Math.round(avgKills * 100),
            avgDeaths: Math.round(avgDeaths * 100),
            avgAssists: Math.round(avgAssists * 100),
            avgKda: Math.round(avgKda * 100),
            winRate: Math.round(winRate * 100),
            avgCsPerMin: Math.round(avgCsPerMin * 100),
            avgGoldPerMin: avgGoldPerMin ? Math.round(avgGoldPerMin) : null,
            avgDamagePerMin: avgDamagePerMin ? Math.round(avgDamagePerMin) : null,
            avgDamageShare: avgDamageShare ? Math.round(avgDamageShare) : null,
            avgVisionScorePerMin: avgVisionPerMin ? Math.round(avgVisionPerMin * 100) : null,
            avgWardsPlaced: avgWardsPlaced ? Math.round(avgWardsPlaced * 100) : null,
            avgControlWardsPlaced: avgControlWards ? Math.round(avgControlWards * 100) : null,
            avgKillParticipation: avgKillParticipation ? Math.round(avgKillParticipation) : null,
            avgSoloKills: avgSoloKills ? Math.round(avgSoloKills * 100) : null,
            avgSkillshotsHit: avgSkillshotsHit ? Math.round(avgSkillshotsHit) : null,
            avgSkillshotsDodged: avgSkillshotsDodged ? Math.round(avgSkillshotsDodged) : null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [championBenchmarks.championId, championBenchmarks.role, championBenchmarks.tier],
            set: {
              championName: stats.championName,
              gamesAnalyzed: stats.gamesCount,
              avgKills: Math.round(avgKills * 100),
              avgDeaths: Math.round(avgDeaths * 100),
              avgAssists: Math.round(avgAssists * 100),
              avgKda: Math.round(avgKda * 100),
              winRate: Math.round(winRate * 100),
              avgCsPerMin: Math.round(avgCsPerMin * 100),
              avgGoldPerMin: avgGoldPerMin ? Math.round(avgGoldPerMin) : null,
              avgDamagePerMin: avgDamagePerMin ? Math.round(avgDamagePerMin) : null,
              avgDamageShare: avgDamageShare ? Math.round(avgDamageShare) : null,
              avgVisionScorePerMin: avgVisionPerMin ? Math.round(avgVisionPerMin * 100) : null,
              avgWardsPlaced: avgWardsPlaced ? Math.round(avgWardsPlaced * 100) : null,
              avgControlWardsPlaced: avgControlWards ? Math.round(avgControlWards * 100) : null,
              avgKillParticipation: avgKillParticipation ? Math.round(avgKillParticipation) : null,
              avgSoloKills: avgSoloKills ? Math.round(avgSoloKills * 100) : null,
              avgSkillshotsHit: avgSkillshotsHit ? Math.round(avgSkillshotsHit) : null,
              avgSkillshotsDodged: avgSkillshotsDodged ? Math.round(avgSkillshotsDodged) : null,
              updatedAt: now,
            },
          });
        inserted++;
      } catch (e) {
        console.warn(`Failed to insert benchmark for ${stats.championName} ${role}:`, e);
      }
    }

    return NextResponse.json({
      message: `Aggregated ${inserted} champion benchmarks`,
      total: inserted,
    });
  } catch (error) {
    console.error('Champion benchmarks API error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate champion benchmarks' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve benchmarks for a specific champion
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const championId = searchParams.get('championId');
    const championName = searchParams.get('championName');
    const role = searchParams.get('role');

    let query = db.select().from(championBenchmarks);

    if (championId) {
      const benchmarks = await db
        .select()
        .from(championBenchmarks)
        .where(eq(championBenchmarks.championId, parseInt(championId)));
      return NextResponse.json(benchmarks);
    }

    if (championName) {
      const benchmarks = await db
        .select()
        .from(championBenchmarks)
        .where(sql`LOWER(${championBenchmarks.championName}) = LOWER(${championName})`);
      return NextResponse.json(benchmarks);
    }

    // Return all benchmarks
    const allBenchmarks = await db
      .select()
      .from(championBenchmarks)
      .orderBy(desc(championBenchmarks.gamesAnalyzed));

    return NextResponse.json(allBenchmarks);
  } catch (error) {
    console.error('Get champion benchmarks error:', error);
    return NextResponse.json(
      { error: 'Failed to get champion benchmarks' },
      { status: 500 }
    );
  }
}

function normalizeRole(position: string): string | null {
  const roleMap: Record<string, string> = {
    TOP: 'TOP',
    JUNGLE: 'JUNGLE',
    MIDDLE: 'MIDDLE',
    MID: 'MIDDLE',
    BOTTOM: 'BOTTOM',
    ADC: 'BOTTOM',
    UTILITY: 'UTILITY',
    SUPPORT: 'UTILITY',
  };
  return roleMap[position.toUpperCase()] || null;
}
