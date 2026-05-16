import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { InventoryItem, PurchaseOrder, StockMovement, Vendor } from '../types/inventory';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useVendors = () => {
  return useQuery({
    queryKey: ['inventory-vendors'],
    queryFn: async (): Promise<Vendor[]> => {
      const response = await apiClient.get<Vendor[] | { results: Vendor[] }>('/inventory/vendors/');
      return getList(response.data);
    },
  });
};

export const useInventoryItems = () => {
  return useQuery({
    queryKey: ['inventory-items'],
    queryFn: async (): Promise<InventoryItem[]> => {
      const response = await apiClient.get<InventoryItem[] | { results: InventoryItem[] }>('/inventory/items/');
      return getList(response.data);
    },
  });
};

export const useLowStockItems = () => {
  return useQuery({
    queryKey: ['inventory-items', 'low-stock'],
    queryFn: async (): Promise<InventoryItem[]> => {
      const response = await apiClient.get<InventoryItem[] | { results: InventoryItem[] }>('/inventory/items/low_stock/');
      return getList(response.data);
    },
  });
};

export const useStockMovements = () => {
  return useQuery({
    queryKey: ['stock-movements'],
    queryFn: async (): Promise<StockMovement[]> => {
      const response = await apiClient.get<StockMovement[] | { results: StockMovement[] }>('/inventory/movements/');
      return getList(response.data);
    },
  });
};

export const usePurchaseOrders = () => {
  return useQuery({
    queryKey: ['purchase-orders'],
    queryFn: async (): Promise<PurchaseOrder[]> => {
      const response = await apiClient.get<PurchaseOrder[] | { results: PurchaseOrder[] }>('/inventory/purchase-orders/');
      return getList(response.data);
    },
  });
};

export const useCreateVendor = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Vendor, 'id'>): Promise<Vendor> => {
      const response = await apiClient.post('/inventory/vendors/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-vendors'] }),
  });
};

export const useCreateInventoryItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<InventoryItem, 'id' | 'current_stock' | 'is_low_stock'>,
    ): Promise<InventoryItem> => {
      const response = await apiClient.post('/inventory/items/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-items'] }),
  });
};

export const useReceiveStock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      item: string;
      vendor?: string;
      quantity: string;
      unit_cost: string;
      reference?: string;
      notes?: string;
      payment_account: '1000' | '1010' | '2000';
    }): Promise<StockMovement> => {
      const response = await apiClient.post('/inventory/movements/receive/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items', 'low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};

export const useAdjustStock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      item: string;
      movement_type: 'waste' | 'adjustment_in' | 'adjustment_out';
      quantity: string;
      unit_cost?: string;
      reference?: string;
      notes?: string;
    }): Promise<StockMovement> => {
      const response = await apiClient.post('/inventory/movements/adjust/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items', 'low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
};

export const useCreatePurchaseOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      vendor: string;
      expected_date?: string;
      reference?: string;
      notes?: string;
      lines: Array<{ item: string; quantity: string; unit_cost: string; notes?: string }>;
    }): Promise<PurchaseOrder> => {
      const response = await apiClient.post('/inventory/purchase-orders/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
};

export const usePurchaseOrderAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      purchaseOrderId,
      action,
      payload,
    }: {
      purchaseOrderId: string;
      action: 'submit' | 'receive' | 'cancel' | 'pay';
      payload?: { payment_method?: 'cash' | 'bank' };
    }): Promise<PurchaseOrder> => {
      const response = await apiClient.post(`/inventory/purchase-orders/${purchaseOrderId}/${action}/`, payload || {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items', 'low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};
