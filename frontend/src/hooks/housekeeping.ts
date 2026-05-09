import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { HousekeepingTask } from '../types/housekeeping';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useHousekeepingTasks = () => {
  return useQuery({
    queryKey: ['housekeeping-tasks'],
    queryFn: async (): Promise<HousekeepingTask[]> => {
      const response = await apiClient.get<HousekeepingTask[] | { results: HousekeepingTask[] }>('/housekeeping/tasks/');
      return getList(response.data);
    },
  });
};

export const useCreateHousekeepingTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      room: string;
      task_type: HousekeepingTask['task_type'];
      priority: HousekeepingTask['priority'];
      notes?: string;
      assigned_to?: string;
    }) => {
      const response = await apiClient.post('/housekeeping/tasks/create_for_room/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['housekeeping-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
};

export const useHousekeepingAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, action, notes }: { taskId: string; action: 'start' | 'complete' | 'block' | 'escalate_maintenance'; notes?: string }) => {
      const response = await apiClient.post(`/housekeeping/tasks/${taskId}/${action}/`, notes ? { notes } : {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['housekeeping-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
};

