import { useQuery } from '@tanstack/react-query';
import apiClient from '../services/api';
import { AuditLog } from '../types/audit';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useAuditLogs = () => {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: async (): Promise<AuditLog[]> => {
      const response = await apiClient.get<AuditLog[] | { results: AuditLog[] }>('/audit/logs/', {
        params: {
          limit: 100,
          ordering: '-created_at',
        },
      });
      return getList(response.data);
    },
  });
};
