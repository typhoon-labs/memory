import { APP_ROLES } from '@typhoon/config';
import { AuthGate } from '@typhoon/ui';

export function AdminAuthGate() {
  return <AuthGate requiredRoles={[APP_ROLES.ADMIN]} />;
}
