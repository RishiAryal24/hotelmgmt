import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { MaintenanceTicket } from '../types/maintenance';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useMaintenanceTickets = () => {
  return useQuery({
    queryKey: ['maintenance-tickets'],
    queryFn: async (): Promise<MaintenanceTicket[]> => {
      const response = await apiClient.get<MaintenanceTicket[] | { results: MaintenanceTicket[] }>('/maintenance/tickets/');
      return getList(response.data);
    },
  });
};

export const useCreateMaintenanceTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      room: string;
      title: string;
      description?: string;
      category: MaintenanceTicket['category'];
      priority: MaintenanceTicket['priority'];
      assigned_to?: string;
      due_at?: string;
    }): Promise<MaintenanceTicket> => {
      const response = await apiClient.post('/maintenance/tickets/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
};

export const useMaintenanceAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      action,
      resolution_notes,
    }: {
      ticketId: string;
      action: 'start' | 'resolve' | 'close' | 'cancel';
      resolution_notes?: string;
    }): Promise<MaintenanceTicket> => {
      const response = await apiClient.post(`/maintenance/tickets/${ticketId}/${action}/`, resolution_notes ? { resolution_notes } : {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['housekeeping-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
};
