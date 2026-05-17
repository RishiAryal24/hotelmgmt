import { useQuery } from '@tanstack/react-query';
import { getCurrentUser } from '../services/auth';
import { canAccess } from '../services/permissions';

export const usePermissions = () => {
  const { data: user, isLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });

  return {
    user,
    isLoading,
    can: (permissions: string | string[]) => canAccess(user, permissions),
  };
};
