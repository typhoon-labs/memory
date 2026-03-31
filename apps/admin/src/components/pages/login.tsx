import { useNavigate } from '@tanstack/react-router';
import { LoginPage, useAuth } from '@typhoon/ui';

export function AdminLoginPage() {
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
