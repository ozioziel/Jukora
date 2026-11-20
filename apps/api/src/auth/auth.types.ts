import type { Locale, StaffRole, UserMode } from '@jucumari/shared';

export interface AuthUser {
  id: string;
  address: string;
  authMethod: 'pollar' | 'wallet' | 'demo';
  displayName: string;
  locale: Locale;
  timeZone: string;
  modes: UserMode[];
  activeMode: UserMode;
  staffRoles: StaffRole[];
  kycStatus: string;
  isDemo: boolean;
  sessionId: string;
}

export const SESSION_COOKIE = 'jcm_session';
