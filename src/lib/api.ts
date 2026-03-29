import { clearAuthSession, getStoredAuthSession } from './auth';

export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const session = getStoredAuthSession();

  if (session?.token) {
    headers.set('x-session-token', session.token);
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  if (response.status === 401) {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  return response;
}
