import { Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, isAuthenticated } from '../services/auth';
import { canAccess } from '../services/permissions';

interface ProtectedRouteProps {
  requireAuth?: boolean;
  permissions?: string[];
}

const ProtectedRoute = ({ requireAuth = true, permissions }: ProtectedRouteProps) => {
  const shouldFetchUser = requireAuth && isAuthenticated() && Boolean(permissions?.length);
  const { data: user, isLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    enabled: shouldFetchUser,
  });

  if (requireAuth && !isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  if (shouldFetchUser && isLoading) {
    return <div className="p-6 text-slate-600">Checking access...</div>;
  }

  if (permissions?.length && !canAccess(user, permissions)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
