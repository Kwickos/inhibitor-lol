import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// Check if rate limiting is enabled and Redis is configured
const isRateLimitEnabled = 
  process.env.ENABLE_RATE_LIMIT === 'true' &&
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN;

// Create rate limiter only if configured
const ratelimit = isRateLimitEnabled
  ? new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      }),
      // 60 requests per minute per IP
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      analytics: true,
      prefix: 'ratelimit:api',
    })
  : null;

// Stricter rate limit for expensive operations (refresh-matches, analysis)
const strictRatelimit = isRateLimitEnabled
  ? new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      }),
      // 10 requests per minute per IP for expensive operations
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      analytics: true,
      prefix: 'ratelimit:expensive',
    })
  : null;

export type RateLimitType = 'default' | 'strict';

/**
 * Check rate limit for a request
 * Returns null if allowed, or a Response if rate limited
 */
export async function checkRateLimit(
  request: NextRequest,
  type: RateLimitType = 'default'
): Promise<NextResponse | null> {
  // Skip rate limiting if not configured
  if (!isRateLimitEnabled) {
    return null;
  }

  const limiter = type === 'strict' ? strictRatelimit : ratelimit;
  if (!limiter) return null;

  // Get IP from headers (Vercel sets these)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 
             request.headers.get('x-real-ip') ?? 
             'anonymous';

  try {
    const { success, limit, reset, remaining } = await limiter.limit(ip);

    if (!success) {
      return NextResponse.json(
        { 
          error: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    return null;
  } catch (error) {
    // If rate limiting fails, allow the request (fail open)
    console.warn('[RateLimit] Error checking rate limit:', error);
    return null;
  }
}

/**
 * Get rate limit headers for successful requests
 */
export async function getRateLimitHeaders(
  request: NextRequest,
  type: RateLimitType = 'default'
): Promise<Record<string, string>> {
  if (!isRateLimitEnabled) {
    return {};
  }

  const limiter = type === 'strict' ? strictRatelimit : ratelimit;
  if (!limiter) return {};

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 
             request.headers.get('x-real-ip') ?? 
             'anonymous';

  try {
    const { limit, remaining, reset } = await limiter.limit(ip);
    return {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': reset.toString(),
    };
  } catch {
    return {};
  }
}
