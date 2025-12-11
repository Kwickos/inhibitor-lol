import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playerMatches, matches } from '@/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { calculateGameScoreFull } from '@/lib/game-score';
import type { Match } from '@/types/riot';

// Recalculate game scores for matches that don't have them
// This is useful for backfilling scores for old matches

export const maxDuration = 60;

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { puuid } = await params;

  if (!puuid || puuid.length < 10) {
    return NextResponse.json({ error: 'Invalid puuid' }, { status: 400 });
  }

  try {
    // Find matches for this player that don't have scores calculated
    const matchesWithoutScores = await db
      .select({
        matchId: playerMatches.matchId,
        puuid: playerMatches.puuid,
      })
      .from(playerMatches)
      .where(
        and(
          eq(playerMatches.puuid, puuid),
          isNull(playerMatches.gameScore)
        )
      )
      .orderBy(desc(playerMatches.createdAt))
      .limit(50); // Process 50 at a time to avoid timeout

    if (matchesWithoutScores.length === 0) {
      return NextResponse.json({
        message: 'All matches already have scores',
        updated: 0,
      });
    }

    let updatedCount = 0;

    for (const { matchId } of matchesWithoutScores) {
      try {
        // Get the full match data
        const matchData = await db.query.matches.findFirst({
          where: eq(matches.matchId, matchId),
        });

        if (!matchData) continue;

        // Parse participants and teams
        const participants = typeof matchData.participants === 'string'
          ? JSON.parse(matchData.participants)
          : matchData.participants;
        const teams = typeof matchData.teams === 'string'
          ? JSON.parse(matchData.teams)
          : matchData.teams;

        if (!participants || !Array.isArray(participants)) continue;

        // Calculate and update scores for ALL participants in this match
        for (const participant of participants as Match['info']['participants']) {
          const teamObjectives = teams?.find((t: Match['info']['teams'][0]) => t.teamId === participant.teamId);
          
          try {
            const score = calculateGameScoreFull(
              participant,
              participants,
              matchData.gameDuration,
              participant.win,
              teamObjectives
            );

            // Update the player match record
            await db
              .update(playerMatches)
              .set({
                gameScore: score.overall,
                gameGrade: score.grade,
                combatScore: score.combat,
                farmingScore: score.farming,
                visionScore2: score.vision,
                objectivesScore: score.objectives,
                insights: score.insights,
                improvements: score.improvements,
              })
              .where(
                and(
                  eq(playerMatches.puuid, participant.puuid),
                  eq(playerMatches.matchId, matchId)
                )
              );

            // Count only the requested player's updates
            if (participant.puuid === puuid) {
              updatedCount++;
            }
          } catch (e) {
            console.warn(`Failed to calculate score for participant ${participant.puuid} in match ${matchId}:`, e);
          }
        }
      } catch (e) {
        console.warn(`Failed to process match ${matchId}:`, e);
      }
    }

    return NextResponse.json({
      message: `Recalculated scores for ${updatedCount} matches`,
      updated: updatedCount,
      remaining: matchesWithoutScores.length - updatedCount,
    });
  } catch (error) {
    console.error('Recalculate scores error:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate scores' },
      { status: 500 }
    );
  }
}

// GET to check status
export async function GET(request: NextRequest, { params }: Params) {
  const { puuid } = await params;

  if (!puuid || puuid.length < 10) {
    return NextResponse.json({ error: 'Invalid puuid' }, { status: 400 });
  }

  try {
    // Count matches without scores
    const matchesWithoutScores = await db
      .select({
        matchId: playerMatches.matchId,
      })
      .from(playerMatches)
      .where(
        and(
          eq(playerMatches.puuid, puuid),
          isNull(playerMatches.gameScore)
        )
      );

    // Count total matches
    const totalMatches = await db
      .select({
        matchId: playerMatches.matchId,
      })
      .from(playerMatches)
      .where(eq(playerMatches.puuid, puuid));

    return NextResponse.json({
      totalMatches: totalMatches.length,
      matchesWithoutScores: matchesWithoutScores.length,
      matchesWithScores: totalMatches.length - matchesWithoutScores.length,
      needsRecalculation: matchesWithoutScores.length > 0,
    });
  } catch (error) {
    console.error('Check scores error:', error);
    return NextResponse.json(
      { error: 'Failed to check scores' },
      { status: 500 }
    );
  }
}
