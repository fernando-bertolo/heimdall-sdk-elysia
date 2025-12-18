import type { Context } from 'elysia'

export type LogEntry = {
  serviceName: string;
  timestamp: number;
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  ip: string;
  userAgent?: string | string[] | undefined;
  query: Record<string, any>;
  params: Record<string, any>;
  headers: Record<string, any>;
  body?: any;
};

export async function buildLog(
  ctx: Context,
  duration: number,
  includeBody: boolean,
  serviceName: string
): Promise<LogEntry> {
  const url = new URL(ctx.request.url)

  return {
    serviceName,
    timestamp: Date.now(),
    method: ctx.request.method,
    url: ctx.request.url,
    statusCode: Number(ctx.set.status),
    duration,
    ip: 
      ctx.request.headers.get('x-forwarded-for') ??
      ctx.server?.requestIP(ctx.request)?.address ??
      '',
    userAgent: ctx.request.headers.get('user-agent') ?? '',
    query: Object.fromEntries(url.searchParams),
    params: ctx.params ?? {},
    headers: Object.fromEntries(ctx.request.headers),
    body: includeBody ? await safeBody(ctx.request) : undefined,
  };
}

async function safeBody(request: Request) {
  try {
    return await request.clone().json()
  } catch {
    return undefined
  }
}
