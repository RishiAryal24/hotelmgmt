import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { Account, JournalEntry, JournalEntryCreateInput } from '../types/accounting';

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

