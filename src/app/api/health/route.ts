import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: {
      status: 'up' | 'down';
      latency?: number;
      error?: string;
    };
    redis: {
      status: 'up' | 'down';
      latency?: number;
      error?: string;
    };
    riotApi: {
      status: 'configured' | 'missing';
    };
  };
  version: string;
}

export async function GET() {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'down' },
      redis: { status: 'down' },
      riotApi: { status: process.env.RIOT_API_KEY ? 'configured' : 'missing' },
    },
    version: process.env.npm_package_version || '0.1.0',
  };

  // Check Database (Turso)
  try {
    const dbStart = Date.now();
    await db.run(sql`SELECT 1`);
    health.services.database = {
      status: 'up',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    health.services.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    health.status = 'degraded';
  }

  // Check Redis (Upstash)
  try {
    const redisStart = Date.now();
    await redis.ping();
    health.services.redis = {
      status: 'up',
      latency: Date.now() - redisStart,
    };
  } catch (error) {
    health.services.redis = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    // Redis down is degraded, not unhealthy (we can work without it)
    if (health.status === 'healthy') {
      health.status = 'degraded';
    }
  }

  // If database is down, we're unhealthy
  if (health.services.database.status === 'down') {
    health.status = 'unhealthy';
  }

  // If Riot API key is missing, we're unhealthy
  if (health.services.riotApi.status === 'missing') {
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(health, { status: statusCode });
}
