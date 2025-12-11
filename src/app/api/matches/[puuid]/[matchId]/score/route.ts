import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playerMatches } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// Save calculated game score to DB
// Called by frontend after lazy-loading match details and calculating score

interface Params {
  params: Promise<{
    puuid: string;
    matchId: string;
  }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { puuid, matchId } = await params;
    const body = await request.json();

    const {
      gameScore,
      gameGrade,
      combatScore,
      farmingScore,
      visionScore,
      objectivesScore,
      insights,
      improvements,
    } = body;

    // Validate required fields
    if (typeof gameScore !== 'number' || !gameGrade) {
      return NextResponse.json(
        { error: 'Invalid score data' },
        { status: 400 }
      );
    }

    // Update the player match record
    await db
      .update(playerMatches)
      .set({
        gameScore,
        gameGrade,
        combatScore: combatScore ?? null,
        farmingScore: farmingScore ?? null,
        visionScore2: visionScore ?? null,
        objectivesScore: objectivesScore ?? null,
        insights: insights ?? null,
        improvements: improvements ?? null,
      })
      .where(
        and(
          eq(playerMatches.puuid, puuid),
          eq(playerMatches.matchId, matchId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save score error:', error);
    return NextResponse.json(
      { error: 'Failed to save score' },
      { status: 500 }
    );
  }
}
