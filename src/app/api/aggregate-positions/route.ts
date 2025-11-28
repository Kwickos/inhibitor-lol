import { NextResponse } from 'next/server';
import { aggregateChampionPositionRates } from '@/lib/cache';

// POST /api/aggregate-positions - Trigger aggregation of champion position rates
export async function POST() {
  try {
    await aggregateChampionPositionRates();
    return NextResponse.json({ success: true, message: 'Aggregation complete' });
  } catch (error) {
    console.error('Aggregation error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate position rates' },
      { status: 500 }
    );
  }
}

// GET /api/aggregate-positions - Get current stats
export async function GET() {
  try {
    const { getAllLocalChampionPositionRates } = await import('@/lib/cache');
    const rates = await getAllLocalChampionPositionRates();
    const championCount = Object.keys(rates).length;

    return NextResponse.json({
      championCount,
      message: `Position data available for ${championCount} champions`,
    });
  } catch (error) {
    console.error('Error fetching position stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch position stats' },
      { status: 500 }
    );
  }
}
