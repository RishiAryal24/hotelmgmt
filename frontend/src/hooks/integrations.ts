import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { OTAChannel, OTAProviderActionResult, OTARatePlanMapping, OTAReservationImport, OTARoomTypeMapping, OTASyncJob, OTAWebhookEvent } from '../types/integrations';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useOTAChannels = () => {
  return useQuery({
    queryKey: ['ota-channels'],
    queryFn: async (): Promise<OTAChannel[]> => {
      const response = await apiClient.get<OTAChannel[] | { results: OTAChannel[] }>('/integrations/ota-channels/', {
        params: { ordering: 'name' },
      });
      return getList(response.data);
    },
    refetchInterval: 10000,
  });
};

export const useOTARoomMappings = () => {
  return useQuery({
    queryKey: ['ota-room-mappings'],
    queryFn: async (): Promise<OTARoomTypeMapping[]> => {
      const response = await apiClient.get<OTARoomTypeMapping[] | { results: OTARoomTypeMapping[] }>('/integrations/ota-room-mappings/');
      return getList(response.data);
    },
    refetchInterval: 10000,
  });
};

export const useOTARateMappings = () => {
  return useQuery({
    queryKey: ['ota-rate-mappings'],
    queryFn: async (): Promise<OTARatePlanMapping[]> => {
      const response = await apiClient.get<OTARatePlanMapping[] | { results: OTARatePlanMapping[] }>('/integrations/ota-rate-mappings/');
      return getList(response.data);
    },
    refetchInterval: 10000,
  });
};

export const useOTASyncJobs = () => {
  return useQuery({
    queryKey: ['ota-sync-jobs'],
    queryFn: async (): Promise<OTASyncJob[]> => {
      const response = await apiClient.get<OTASyncJob[] | { results: OTASyncJob[] }>('/integrations/ota-sync-jobs/', {
        params: { limit: 20, ordering: '-created_at' },
      });
      return getList(response.data);
    },
    refetchInterval: 5000,
  });
};

export const useOTAWebhookEvents = () => {
  return useQuery({
    queryKey: ['ota-webhook-events'],
    queryFn: async (): Promise<OTAWebhookEvent[]> => {
      const response = await apiClient.get<OTAWebhookEvent[] | { results: OTAWebhookEvent[] }>('/integrations/ota-webhook-events/', {
        params: { limit: 20, ordering: '-created_at' },
      });
      return getList(response.data);
    },
    refetchInterval: 5000,
  });
};

export const useOTAReservationImports = () => {
  return useQuery({
    queryKey: ['ota-reservation-imports'],
    queryFn: async (): Promise<OTAReservationImport[]> => {
      const response = await apiClient.get<OTAReservationImport[] | { results: OTAReservationImport[] }>('/integrations/ota-reservation-imports/', {
        params: { limit: 50, ordering: '-created_at' },
      });
      return getList(response.data);
    },
    refetchInterval: 5000,
  });
};

export const useCreateOTAChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<OTAChannel> & { name: string; code: string }): Promise<OTAChannel> => {
      const response = await apiClient.post('/integrations/ota-channels/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ota-channels'] }),
  });
};

export const useUpdateOTAChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, payload }: { channelId: number; payload: Partial<OTAChannel> }): Promise<OTAChannel> => {
      const response = await apiClient.patch(`/integrations/ota-channels/${channelId}/`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-channels'] });
      queryClient.invalidateQueries({ queryKey: ['ota-room-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['ota-rate-mappings'] });
    },
  });
};

export const useCreateOTARoomMapping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { channel: number; room_type: string; external_room_type_id: string; external_room_type_name?: string; is_active?: boolean }): Promise<OTARoomTypeMapping> => {
      const response = await apiClient.post('/integrations/ota-room-mappings/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-channels'] });
      queryClient.invalidateQueries({ queryKey: ['ota-room-mappings'] });
    },
  });
};

export const useCreateOTARateMapping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { channel: number; rate_plan: string; external_rate_plan_id: string; external_rate_plan_name?: string; is_active?: boolean }): Promise<OTARatePlanMapping> => {
      const response = await apiClient.post('/integrations/ota-rate-mappings/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-channels'] });
      queryClient.invalidateQueries({ queryKey: ['ota-rate-mappings'] });
    },
  });
};

export const useOTASyncAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, action, date_from, date_to }: { channelId: number; action: 'sync-availability' | 'sync-rates'; date_from: string; date_to: string }): Promise<OTASyncJob> => {
      const response = await apiClient.post(`/integrations/ota-channels/${channelId}/${action}/`, { date_from, date_to });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-channels'] });
      queryClient.invalidateQueries({ queryKey: ['ota-sync-jobs'] });
    },
  });
};

export const useOTAConnectionCheck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: number): Promise<OTAProviderActionResult> => {
      const response = await apiClient.post(`/integrations/ota-channels/${channelId}/check-connection/`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ota-channels'] }),
  });
};

export const useOTADiscoverInventory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: number): Promise<OTAProviderActionResult> => {
      const response = await apiClient.post(`/integrations/ota-channels/${channelId}/discover-inventory/`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ota-channels'] }),
  });
};

export const useOTAActivateRooms = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: number): Promise<OTAProviderActionResult> => {
      const response = await apiClient.post(`/integrations/ota-channels/${channelId}/activate-rooms/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-channels'] });
      queryClient.invalidateQueries({ queryKey: ['ota-sync-jobs'] });
    },
  });
};

export const useOTAPullReservations = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: number): Promise<OTASyncJob> => {
      const response = await apiClient.post(`/integrations/ota-channels/${channelId}/pull-reservations/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-sync-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['ota-reservation-imports'] });
      queryClient.invalidateQueries({ queryKey: ['ota-webhook-events'] });
    },
  });
};

export const useCreateZodomusTestReservation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, payload }: { channelId: number; payload: Record<string, string> }): Promise<OTASyncJob> => {
      const response = await apiClient.post(`/integrations/ota-channels/${channelId}/create-test-reservation/`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-sync-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['ota-reservation-imports'] });
      queryClient.invalidateQueries({ queryKey: ['ota-webhook-events'] });
    },
  });
};

export const useOTAReservationImportAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ importId, action, notes }: { importId: number; action: 'accept' | 'reject' | 'apply-modification' | 'apply-cancellation'; notes?: string }): Promise<OTAReservationImport> => {
      const response = await apiClient.post(`/integrations/ota-reservation-imports/${importId}/${action}/`, { notes: notes || '' });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-reservation-imports'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
};
