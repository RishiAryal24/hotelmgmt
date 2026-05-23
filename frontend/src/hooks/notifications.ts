import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { NotificationEvent, NotificationTemplate } from '../types/notifications';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useNotificationEvents = (params?: Record<string, string | number | undefined>, enabled = true) => {
  return useQuery({
    queryKey: ['notification-events', params || {}],
    enabled,
    queryFn: async (): Promise<NotificationEvent[]> => {
      const response = await apiClient.get<NotificationEvent[] | { results: NotificationEvent[] }>('/notifications/events/', {
        params: {
          limit: 100,
          ordering: '-created_at',
          ...params,
        },
      });
      return getList(response.data);
    },
  });
};

export const useNotificationTemplates = () => {
  return useQuery({
    queryKey: ['notification-templates'],
    queryFn: async (): Promise<NotificationTemplate[]> => {
      const response = await apiClient.get<NotificationTemplate[] | { results: NotificationTemplate[] }>('/notifications/templates/', {
        params: {
          ordering: 'code',
        },
      });
      return getList(response.data);
    },
  });
};

export const useNotificationWorkflowAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, action, notes }: { eventId: string; action: 'acknowledge' | 'resolve' | 'reopen'; notes?: string }): Promise<NotificationEvent> => {
      const response = await apiClient.post<NotificationEvent>(`/notifications/events/${eventId}/${action}/`, { notes: notes || '' });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-events'] }),
  });
};

export const useNotificationDeliveryAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, action, reason }: { eventId: string; action: 'retry' | 'cancel-delivery'; reason?: string }): Promise<NotificationEvent> => {
      const response = await apiClient.post<NotificationEvent>(`/notifications/events/${eventId}/${action}/`, { reason: reason || '' });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-events'] }),
  });
};

export const useNotificationTestDelivery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { channel: 'email' | 'sms' | 'whatsapp'; recipient_email?: string; recipient_phone?: string; subject?: string; message?: string }): Promise<NotificationEvent> => {
      const response = await apiClient.post<NotificationEvent>('/notifications/events/test-delivery/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-events'] }),
  });
};
