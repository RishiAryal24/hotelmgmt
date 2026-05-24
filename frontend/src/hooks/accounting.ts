import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { Account, BalanceSheetReport, FiscalPeriod, FiscalPeriodCreateInput, JournalEntry, JournalEntryCreateInput, NightAuditRun, NightAuditSchedule, ProfitAndLossReport, TaxRate, TaxRateCreateInput, TrialBalanceReport, VendorBill, VendorBillCreateInput } from '../types/accounting';

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

export const useTaxRates = () => {
  return useQuery({
    queryKey: ['tax-rates'],
    queryFn: async (): Promise<TaxRate[]> => {
      const response = await apiClient.get<TaxRate[] | { results: TaxRate[] }>('/accounting/tax-rates/');
      return getList(response.data);
    },
  });
};

export const useVendorBills = () => {
  return useQuery({
    queryKey: ['vendor-bills'],
    queryFn: async (): Promise<VendorBill[]> => {
      const response = await apiClient.get<VendorBill[] | { results: VendorBill[] }>('/accounting/vendor-bills/');
      return getList(response.data);
    },
  });
};

export const useNightAuditRuns = () => {
  return useQuery({
    queryKey: ['night-audit-runs'],
    queryFn: async (): Promise<NightAuditRun[]> => {
      const response = await apiClient.get<NightAuditRun[] | { results: NightAuditRun[] }>('/accounting/night-audits/');
      return getList(response.data);
    },
  });
};

export const useNightAuditSchedule = () => {
  return useQuery({
    queryKey: ['night-audit-schedule'],
    queryFn: async (): Promise<NightAuditSchedule> => {
      const response = await apiClient.get<NightAuditSchedule>('/accounting/night-audits/schedule/');
      return response.data;
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

export const useCreateTaxRate = () => {
  const queryClient = useQueryClient();
  return useMutation<TaxRate, Error, TaxRateCreateInput>({
    mutationFn: async (payload: TaxRateCreateInput) => {
      const response = await apiClient.post('/accounting/tax-rates/', payload);
      return response.data as TaxRate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
    },
  });
};

export const useCreateVendorBill = () => {
  const queryClient = useQueryClient();
  return useMutation<VendorBill, Error, VendorBillCreateInput>({
    mutationFn: async (payload: VendorBillCreateInput) => {
      const response = await apiClient.post('/accounting/vendor-bills/', payload);
      return response.data as VendorBill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
    },
  });
};

export const useVendorBillAction = () => {
  const queryClient = useQueryClient();
  return useMutation<VendorBill, Error, { billId: string; action: 'post' }>({
    mutationFn: async ({ billId, action }) => {
      const response = await apiClient.post(`/accounting/vendor-bills/${billId}/${action}/`, {});
      return response.data as VendorBill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
      queryClient.invalidateQueries({ queryKey: ['balance-sheet'] });
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

export const useUpdateNightAuditSchedule = () => {
  const queryClient = useQueryClient();
  return useMutation<NightAuditSchedule, Error, { enabled: boolean; run_time: string; timezone: string; notes?: string }>({
    mutationFn: async (payload) => {
      const response = await apiClient.put('/accounting/night-audits/configure-schedule/', payload);
      return response.data as NightAuditSchedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['night-audit-schedule'] });
    },
  });
};

export const useRunNightAudit = () => {
  const queryClient = useQueryClient();
  return useMutation<NightAuditRun, Error, { audit_date?: string }>({
    mutationFn: async (payload) => {
      const response = await apiClient.post('/accounting/night-audits/run/', payload);
      return response.data as NightAuditRun;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['night-audit-runs'] });
      queryClient.invalidateQueries({ queryKey: ['night-audit-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
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
