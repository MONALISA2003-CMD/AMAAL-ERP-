import { NextRequest } from 'next/server';

const BACKEND = (process.env.AMAAL_BACKEND_URL || 'https://amaal-api.onrender.com').replace(/\/$/, '');

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${BACKEND}/${path.join('/')}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'x-request-id', 'x-idempotency-key', 'x-amaal-mfa-assertion']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('accept', request.headers.get('accept') || 'application/json');

  const init: RequestInit = { method: request.method, headers, cache: 'no-store', redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const requestId = upstream.headers.get('x-request-id');
  if (requestId) responseHeaders.set('x-request-id', requestId);
  responseHeaders.set('cache-control', 'no-store');

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
