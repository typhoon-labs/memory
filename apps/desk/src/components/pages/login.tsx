import { useNavigate } from '@tanstack/react-router';
import { LoginPage, useAuth } from '@typhoon/ui';
import { usePageTitle } from '../../hooks/use-page-title';

export function DeskLoginPage() {
  usePageTitle('Sign In');
  const navigate = useNavigate();
  const { refetchSession } = useAuth();

  return (
    <LoginPage
      onSuccess={() => {
        refetchSession();
        navigate({ to: '/' });
      }}
    />
  );
}
