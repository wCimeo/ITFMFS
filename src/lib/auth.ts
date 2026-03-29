export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  preferred_theme: string;
  prediction_horizon_minutes: number;
  sliding_window_steps: number;
  retrain_cycle_days: number;
  congestion_threshold: number;
  auto_signal_control: number;
  can_manage_users: number;
  can_manage_data: number;
  can_manage_models: number;
  can_manage_signals: number;
  session_expires_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

const STORAGE_KEY = 'traffic-system-auth-session';

export function getStoredAuthSession(): AuthSession | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.expiresAt || !parsed?.user) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isAuthSessionExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) {
    return true;
  }

  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }

  return timestamp <= Date.now();
}
