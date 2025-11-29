import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playerMatches, matches, championBenchmarks, ranks } from '@/db/schema';
import { eq, sql, and, gte, desc, inArray } from 'drizzle-orm';

// High elo tiers for benchmark comparison
const HIGH_ELO_TIERS = ['DIAMOND', 'EMERALD', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];

// Aggregate champion benchmarks from our stored match data
// This creates benchmarks per champion/role/tier based on player ranks

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minGames = parseInt(searchParams.get('minGames') || '5');

    // Helper to run aggregation query with optional tier filter
    const aggregateStats = async (tierFilter?: string[]) => {
      // Build the base query with optional join to ranks table
      const baseQuery = tierFilter
        ? db
            .select({
              championId: playerMatches.championId,
              championName: playerMatches.championName,
              teamPosition: playerMatches.teamPosition,
              gamesCount: sql<number>`count(*)`.as('games_count'),
              wins: sql<number>`sum(case when ${playerMatches.win} then 1 else 0 end)`.as('wins'),
              totalKills: sql<number>`sum(${playerMatches.kills})`.as('total_kills'),
              totalDeaths: sql<number>`sum(${playerMatches.deaths})`.as('total_deaths'),
              totalAssists: sql<number>`sum(${playerMatches.assists})`.as('total_assists'),
              totalCs: sql<number>`sum(${playerMatches.cs})`.as('total_cs'),
              totalGoldEarned: sql<number>`sum(${playerMatches.goldEarned})`.as('total_gold'),
              totalTimePlayed: sql<number>`sum(${playerMatches.timePlayed})`.as('total_time'),
              totalDamage: sql<number>`sum(${playerMatches.totalDamageDealtToChampions})`.as('total_damage'),
              totalVisionScore: sql<number>`sum(${playerMatches.visionScore})`.as('total_vision'),
              totalWardsPlaced: sql<number>`sum(${playerMatches.wardsPlaced})`.as('total_wards'),
              totalControlWards: sql<number>`sum(${playerMatches.controlWardsPlaced})`.as('total_control_wards'),
              totalSoloKills: sql<number>`sum(${playerMatches.soloKills})`.as('total_solo_kills'),
              totalSkillshotsHit: sql<number>`sum(${playerMatches.skillshotsHit})`.as('total_skillshots_hit'),
              totalSkillshotsDodged: sql<number>`sum(${playerMatches.skillshotsDodged})`.as('total_skillshots_dodged'),
              totalKillParticipation: sql<number>`sum(${playerMatches.killParticipation})`.as('total_kp'),
              totalDamageShare: sql<number>`sum(${playerMatches.teamDamagePercentage})`.as('total_damage_share'),
              kpCount: sql<number>`sum(case when ${playerMatches.killParticipation} is not null then 1 else 0 end)`.as('kp_count'),
              dmgShareCount: sql<number>`sum(case when ${playerMatches.teamDamagePercentage} is not null then 1 else 0 end)`.as('dmg_share_count'),
              soloKillsCount: sql<number>`sum(case when ${playerMatches.soloKills} is not null then 1 else 0 end)`.as('solo_kills_count'),
            })
            .from(playerMatches)
            .innerJoin(ranks, and(
              eq(playerMatches.puuid, ranks.puuid),
              eq(ranks.queueType, 'RANKED_SOLO_5x5')
            ))
            .where(
              and(
                sql`${playerMatches.teamPosition} IS NOT NULL`,
                sql`${playerMatches.teamPosition} != ''`,
                sql`${playerMatches.timePlayed} > 300`,
                sql`${ranks.tier} IN (${sql.join(tierFilter.map(t => sql`${t}`), sql`, `)})`
              )
            )
            .groupBy(playerMatches.championId, playerMatches.championName, playerMatches.teamPosition)
            .having(sql`count(*) >= ${minGames}`)
        : db
            .select({
              championId: playerMatches.championId,
              championName: playerMatches.championName,
              teamPosition: playerMatches.teamPosition,
              gamesCount: sql<number>`count(*)`.as('games_count'),
              wins: sql<number>`sum(case when ${playerMatches.win} then 1 else 0 end)`.as('wins'),
              totalKills: sql<number>`sum(${playerMatches.kills})`.as('total_kills'),
              totalDeaths: sql<number>`sum(${playerMatches.deaths})`.as('total_deaths'),
              totalAssists: sql<number>`sum(${playerMatches.assists})`.as('total_assists'),
              totalCs: sql<number>`sum(${playerMatches.cs})`.as('total_cs'),
              totalGoldEarned: sql<number>`sum(${playerMatches.goldEarned})`.as('total_gold'),
              totalTimePlayed: sql<number>`sum(${playerMatches.timePlayed})`.as('total_time'),
              totalDamage: sql<number>`sum(${playerMatches.totalDamageDealtToChampions})`.as('total_damage'),
              totalVisionScore: sql<number>`sum(${playerMatches.visionScore})`.as('total_vision'),
              totalWardsPlaced: sql<number>`sum(${playerMatches.wardsPlaced})`.as('total_wards'),
              totalControlWards: sql<number>`sum(${playerMatches.controlWardsPlaced})`.as('total_control_wards'),
              totalSoloKills: sql<number>`sum(${playerMatches.soloKills})`.as('total_solo_kills'),
              totalSkillshotsHit: sql<number>`sum(${playerMatches.skillshotsHit})`.as('total_skillshots_hit'),
              totalSkillshotsDodged: sql<number>`sum(${playerMatches.skillshotsDodged})`.as('total_skillshots_dodged'),
              totalKillParticipation: sql<number>`sum(${playerMatches.killParticipation})`.as('total_kp'),
              totalDamageShare: sql<number>`sum(${playerMatches.teamDamagePercentage})`.as('total_damage_share'),
              kpCount: sql<number>`sum(case when ${playerMatches.killParticipation} is not null then 1 else 0 end)`.as('kp_count'),
              dmgShareCount: sql<number>`sum(case when ${playerMatches.teamDamagePercentage} is not null then 1 else 0 end)`.as('dmg_share_count'),
              soloKillsCount: sql<number>`sum(case when ${playerMatches.soloKills} is not null then 1 else 0 end)`.as('solo_kills_count'),
            })
            .from(playerMatches)
            .where(
              and(
                sql`${playerMatches.teamPosition} IS NOT NULL`,
                sql`${playerMatches.teamPosition} != ''`,
                sql`${playerMatches.timePlayed} > 300`
              )
            )
            .groupBy(playerMatches.championId, playerMatches.championName, playerMatches.teamPosition)
            .having(sql`count(*) >= ${minGames}`);

      return baseQuery;
    };

    // Aggregate for HIGH_ELO (Diamond+)
    const highEloStats = await aggregateStats(HIGH_ELO_TIERS);
    console.log(`Found ${highEloStats.length} HIGH_ELO champion/role combinations`);

    // Aggregate for ALL_RANKS (fallback)
    const allRanksStats = await aggregateStats();
    console.log(`Found ${allRanksStats.length} ALL_RANKS champion/role combinations`);

    let inserted = 0;
    const now = new Date();

    // Helper to insert/update benchmark
    const insertBenchmark = async (stats: typeof highEloStats[0], tier: string) => {
      if (!stats.teamPosition) return false;

      const role = normalizeRole(stats.teamPosition);
      if (!role) return false;

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
            tier: tier,
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
        return true;
      } catch (e) {
        console.warn(`Failed to insert benchmark for ${stats.championName} ${role} (${tier}):`, e);
        return false;
      }
    };

    // Insert HIGH_ELO benchmarks (Diamond+)
    for (const stats of highEloStats) {
      if (await insertBenchmark(stats, 'HIGH_ELO')) inserted++;
    }

    // Insert ALL_RANKS benchmarks (fallback)
    for (const stats of allRanksStats) {
      if (await insertBenchmark(stats, 'ALL_RANKS')) inserted++;
    }

    return NextResponse.json({
      message: `Aggregated ${inserted} champion benchmarks (${highEloStats.length} HIGH_ELO, ${allRanksStats.length} ALL_RANKS)`,
      total: inserted,
      highElo: highEloStats.length,
      allRanks: allRanksStats.length,
    });
  } catch (error) {
    console.error('Champion benchmarks API error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate champion benchmarks' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve benchmarks for a specific champion or batch
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const championId = searchParams.get('championId');
    const championName = searchParams.get('championName');
    const championIds = searchParams.get('championIds'); // comma-separated list
    const role = searchParams.get('role');

    // Batch query for multiple champions (for match cards)
    if (championIds) {
      const ids = championIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length === 0) {
        return NextResponse.json([]);
      }

      const benchmarks = await db
        .select()
        .from(championBenchmarks)
        .where(sql`${championBenchmarks.championId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);

      // Return as a map for easy lookup: { "championId-role": benchmark }
      // Prefer HIGH_ELO over ALL_RANKS for each champion/role
      const benchmarkMap: Record<string, typeof benchmarks[0]> = {};
      for (const b of benchmarks) {
        const key = `${b.championId}-${b.role}`;
        const existing = benchmarkMap[key];
        // Prefer HIGH_ELO, otherwise use existing or this one
        if (!existing || b.tier === 'HIGH_ELO') {
          benchmarkMap[key] = b;
        }
      }
      return NextResponse.json(benchmarkMap);
    }

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
