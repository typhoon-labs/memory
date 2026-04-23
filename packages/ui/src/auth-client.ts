import type { auth } from '@typhoon/api/auth';
import { adminClient, genericOAuthClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient<typeof auth>({
  basePath: '/api/v1/auth',
  plugins: [adminClient(), genericOAuthClient()],
});
