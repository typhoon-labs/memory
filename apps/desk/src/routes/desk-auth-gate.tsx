import { APP_ROLES } from '@typhoon/config';
import { AuthGate } from '@typhoon/ui';

export function DeskAuthGate() {
  return <AuthGate requiredRoles={[APP_ROLES.ADMIN, APP_ROLES.REP]} />;
}
