import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError, ZodSchema } from 'zod';

// Re-export all schemas
export * from './schemas';

// ============================================
// Validation Result Types
// ============================================

export type ValidationSuccess<T> = {
  success: true;
  data: T;
};

export type ValidationError = {
  success: false;
  error: NextResponse;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

// ============================================
// Error Formatting
// ============================================

function formatZodError(error: ZodError): string {
  const messages = error.issues.map((e) => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });
  return messages.join(', ');
}

function createErrorResponse(message: string, status: number = 400): NextResponse {
  return NextResponse.json(
    { error: message },
    { status }
  );
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate route parameters (e.g., [region], [puuid])
 */
export async function validateParams<T extends ZodSchema>(
  params: Promise<Record<string, string>>,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  try {
    const resolvedParams = await params;
    const data = schema.parse(resolvedParams);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: createErrorResponse(formatZodError(error)),
      };
    }
    return {
      success: false,
      error: createErrorResponse('Invalid parameters'),
    };
  }
}

/**
 * Validate query string parameters
 */
export function validateQuery<T extends ZodSchema>(
  request: NextRequest,
  schema: T
): ValidationResult<z.infer<T>> {
  try {
    const { searchParams } = new URL(request.url);
    const queryObject = Object.fromEntries(searchParams.entries());
    const data = schema.parse(queryObject);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: createErrorResponse(formatZodError(error)),
      };
    }
    return {
      success: false,
      error: createErrorResponse('Invalid query parameters'),
    };
  }
}

/**
 * Validate request body (JSON)
 */
export async function validateBody<T extends ZodSchema>(
  request: NextRequest,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: createErrorResponse(formatZodError(error)),
      };
    }
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: createErrorResponse('Invalid JSON body'),
      };
    }
    return {
      success: false,
      error: createErrorResponse('Invalid request body'),
    };
  }
}

/**
 * Combined validation for params and query
 */
export async function validateRequest<
  P extends ZodSchema,
  Q extends ZodSchema
>(
  request: NextRequest,
  params: Promise<Record<string, string>>,
  paramsSchema: P,
  querySchema: Q
): Promise<ValidationResult<{ params: z.infer<P>; query: z.infer<Q> }>> {
  // Validate params
  const paramsResult = await validateParams(params, paramsSchema);
  if (!paramsResult.success) {
    return paramsResult;
  }

  // Validate query
  const queryResult = validateQuery(request, querySchema);
  if (!queryResult.success) {
    return queryResult;
  }

  return {
    success: true,
    data: {
      params: paramsResult.data,
      query: queryResult.data,
    },
  };
}

/**
 * Parse Riot ID into gameName and tagLine
 */
export function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const decoded = decodeURIComponent(riotId);
  const lastDash = decoded.lastIndexOf('-');
  
  if (lastDash <= 0 || lastDash >= decoded.length - 1) {
    throw new Error('Invalid Riot ID format');
  }
  
  return {
    gameName: decoded.substring(0, lastDash),
    tagLine: decoded.substring(lastDash + 1),
  };
}
