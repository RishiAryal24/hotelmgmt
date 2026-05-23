import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { PaymentFollowUpStatus, PaymentIntent, PaymentIntentCreatePayload, PaymentReconciliationSummary } from '../types/payments';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const usePaymentIntents = (params?: Record<string, string | number | undefined>) => {
  return useQuery({
    queryKey: ['payment-intents', params || {}],
    queryFn: async (): Promise<PaymentIntent[]> => {
      const response = await apiClient.get<PaymentIntent[] | { results: PaymentIntent[] }>('/payments/intents/', {
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

export const usePaymentReconciliationSummary = (params?: Record<string, string | number | undefined>) => {
  return useQuery({
    queryKey: ['payment-reconciliation-summary', params || {}],
    queryFn: async (): Promise<PaymentReconciliationSummary> => {
      const response = await apiClient.get<PaymentReconciliationSummary>('/payments/intents/summary/', { params });
      return response.data;
    },
  });
};

export const getPaymentIntentExportUrl = (params?: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return `/payments/intents/export/${query ? `?${query}` : ''}`;
};

export const useCreatePaymentIntent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PaymentIntentCreatePayload): Promise<PaymentIntent> => {
      const response = await apiClient.post<PaymentIntent>('/payments/intents/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
      queryClient.invalidateQueries({ queryKey: ['payment-reconciliation-summary'] });
    },
  });
};

export const usePaymentFollowUpAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ intentId, status, notes }: { intentId: string; status: Exclude<PaymentFollowUpStatus, 'none'>; notes?: string }): Promise<PaymentIntent> => {
      const response = await apiClient.post<PaymentIntent>(`/payments/intents/${intentId}/follow-up/`, {
        status,
        notes: notes || '',
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
      queryClient.invalidateQueries({ queryKey: ['payment-reconciliation-summary'] });
    },
  });
};

export const usePaymentIntentAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      intentId,
      action,
      provider_reference,
      message,
      payload,
    }: {
      intentId: string;
      action: 'processing' | 'succeed' | 'fail' | 'cancel' | 'reconcile';
      provider_reference?: string;
      message?: string;
      payload?: Record<string, unknown>;
    }): Promise<PaymentIntent> => {
      const response = await apiClient.post<PaymentIntent>(`/payments/intents/${intentId}/${action}/`, {
        provider_reference: provider_reference || '',
        message: message || '',
        payload: payload || {},
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
      queryClient.invalidateQueries({ queryKey: ['payment-reconciliation-summary'] });
    },
  });
};

export const usePaymentProviderAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ intentId, action }: { intentId: string; action: 'initiate-khalti' | 'lookup-khalti' | 'initiate-esewa' }): Promise<PaymentIntent> => {
      const response = await apiClient.post<PaymentIntent>(`/payments/intents/${intentId}/${action}/`, {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
      queryClient.invalidateQueries({ queryKey: ['payment-reconciliation-summary'] });
    },
  });
};
