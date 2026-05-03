function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const c of cookies) {
    const [k, ...rest] = c.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const isUnsafe = method !== 'GET';
  const headers: Record<string, string> = {};

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }

  if (isUnsafe) {
    const csrf = readCookie('bs_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(path, {
    method,
    headers,
    body,
    credentials: 'include',
    signal: opts.signal,
  });

  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    const code = payload.error?.code ?? 'http_error';
    const message = payload.error?.message ?? `Request failed: ${res.status}`;
    throw new ApiError(res.status, code, message, payload.error?.details);
  }

  if (res.status === 204) return undefined as T;
  // Endpoints that return file streams should not be parsed as JSON.
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.blob()) as unknown as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    throw new ApiError(res.status, 'http_error', `Download failed: ${res.status}`);
  }
  return res.blob();
}

export async function postFormData<T>(path: string, form: FormData): Promise<T> {
  return api<T>(path, { method: 'POST', body: form });
}
