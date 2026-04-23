/** Application role constants. Keep in sync with IdP group mappings (ADMIN_ROLES, REP_ROLES env vars). */
export const APP_ROLES = {
  ADMIN: 'admin',
  REP: 'rep',
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];
