import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { Account, BalanceSheetReport, FiscalPeriod, FiscalPeriodCreateInput, JournalEntry, JournalEntryCreateInput, ProfitAndLossReport, TrialBalanceReport } from '../types/accounting';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useAccounts = () => {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async (): Promise<Account[]> => {
      const response = await apiClient.get<Account[] | { results: Account[] }>('/accounting/accounts/');
      return getList(response.data);
    },
  });
};

export const useJournalEntries = () => {
  return useQuery({
    queryKey: ['journal-entries'],
    queryFn: async (): Promise<JournalEntry[]> => {
      const response = await apiClient.get<JournalEntry[] | { results: JournalEntry[] }>('/accounting/journal-entries/');
      return getList(response.data);
    },
  });
};

export const useFiscalPeriods = () => {
  return useQuery({
    queryKey: ['fiscal-periods'],
    queryFn: async (): Promise<FiscalPeriod[]> => {
      const response = await apiClient.get<FiscalPeriod[] | { results: FiscalPeriod[] }>('/accounting/fiscal-periods/');
      return getList(response.data);
    },
  });
};

export const useTrialBalance = (params?: { date_from?: string; date_to?: string }) => {
  return useQuery({
    queryKey: ['trial-balance', params || {}],
    queryFn: async (): Promise<TrialBalanceReport> => {
      const response = await apiClient.get<TrialBalanceReport>('/accounting/journal-entries/trial-balance/', { params });
      return response.data;
    },
  });
};

export const useProfitAndLoss = (params?: { date_from?: string; date_to?: string }) => {
  return useQuery({
    queryKey: ['profit-loss', params || {}],
    queryFn: async (): Promise<ProfitAndLossReport> => {
      const response = await apiClient.get<ProfitAndLossReport>('/accounting/journal-entries/profit-and-loss/', { params });
      return response.data;
    },
    enabled: Boolean(params?.date_from && params?.date_to),
  });
};

export const useBalanceSheet = (params?: { as_of?: string }) => {
  return useQuery({
    queryKey: ['balance-sheet', params || {}],
    queryFn: async (): Promise<BalanceSheetReport> => {
      const response = await apiClient.get<BalanceSheetReport>('/accounting/journal-entries/balance-sheet/', { params });
      return response.data;
    },
  });
};

export const useCreateJournalEntry = () => {
  const queryClient = useQueryClient();
  return useMutation<JournalEntry, Error, JournalEntryCreateInput>({
    mutationFn: async (journalEntry: JournalEntryCreateInput) => {
      const response = await apiClient.post('/accounting/journal-entries/', journalEntry);
      return response.data as JournalEntry;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal-entries'] }),
  });
};

export const useCreateFiscalPeriod = () => {
  const queryClient = useQueryClient();
  return useMutation<FiscalPeriod, Error, FiscalPeriodCreateInput>({
    mutationFn: async (payload: FiscalPeriodCreateInput) => {
      const response = await apiClient.post('/accounting/fiscal-periods/', payload);
      return response.data as FiscalPeriod;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
    },
  });
};

export const useFiscalPeriodAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodId, action }: { periodId: string; action: 'close' | 'reopen' }) => {
      const response = await apiClient.post(`/accounting/fiscal-periods/${periodId}/${action}/`, {});
      return response.data as FiscalPeriod;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
    },
  });
};

export const useSeedAccounts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/accounting/accounts/seed_defaults/');
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });
};
