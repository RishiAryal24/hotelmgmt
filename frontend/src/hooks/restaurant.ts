import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { CashierCounter, CashierShift, KitchenTicket, MenuCategory, MenuItem, MenuModifier, MenuModifierGroup, MenuRecipeIngredient, RestaurantOrder, RestaurantOrderApproval, RestaurantTable } from '../types/restaurant';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useMenuCategories = () => {
  return useQuery({
    queryKey: ['menu-categories'],
    queryFn: async (): Promise<MenuCategory[]> => {
      const response = await apiClient.get<MenuCategory[] | { results: MenuCategory[] }>('/restaurant/categories/');
      return getList(response.data);
    },
  });
};

export const useMenuItems = () => {
  return useQuery({
    queryKey: ['menu-items'],
    queryFn: async (): Promise<MenuItem[]> => {
      const response = await apiClient.get<MenuItem[] | { results: MenuItem[] }>('/restaurant/items/');
      return getList(response.data);
    },
  });
};

export const useMenuModifierGroups = () => {
  return useQuery({
    queryKey: ['menu-modifier-groups'],
    queryFn: async (): Promise<MenuModifierGroup[]> => {
      const response = await apiClient.get<MenuModifierGroup[] | { results: MenuModifierGroup[] }>('/restaurant/modifier-groups/');
      return getList(response.data);
    },
  });
};

export const useMenuModifiers = () => {
  return useQuery({
    queryKey: ['menu-modifiers'],
    queryFn: async (): Promise<MenuModifier[]> => {
      const response = await apiClient.get<MenuModifier[] | { results: MenuModifier[] }>('/restaurant/modifiers/');
      return getList(response.data);
    },
  });
};

export const useMenuRecipeIngredients = () => {
  return useQuery({
    queryKey: ['menu-recipe-ingredients'],
    queryFn: async (): Promise<MenuRecipeIngredient[]> => {
      const response = await apiClient.get<MenuRecipeIngredient[] | { results: MenuRecipeIngredient[] }>('/restaurant/recipe-ingredients/');
      return getList(response.data);
    },
  });
};

export const useRestaurantTables = () => {
  return useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: async (): Promise<RestaurantTable[]> => {
      const response = await apiClient.get<RestaurantTable[] | { results: RestaurantTable[] }>('/restaurant/tables/');
      return getList(response.data);
    },
  });
};

export const useRestaurantOrders = () => {
  return useQuery({
    queryKey: ['restaurant-orders'],
    queryFn: async (): Promise<RestaurantOrder[]> => {
      const response = await apiClient.get<RestaurantOrder[] | { results: RestaurantOrder[] }>('/restaurant/orders/');
      return getList(response.data);
    },
  });
};

export const useKitchenTickets = () => {
  return useQuery({
    queryKey: ['kitchen-tickets'],
    queryFn: async (): Promise<KitchenTicket[]> => {
      const response = await apiClient.get<KitchenTicket[] | { results: KitchenTicket[] }>('/restaurant/kitchen-tickets/');
      return getList(response.data);
    },
  });
};

export const useRestaurantOrderApprovals = () => {
  return useQuery({
    queryKey: ['restaurant-order-approvals'],
    queryFn: async (): Promise<RestaurantOrderApproval[]> => {
      const response = await apiClient.get<RestaurantOrderApproval[] | { results: RestaurantOrderApproval[] }>('/restaurant/order-approvals/');
      return getList(response.data);
    },
  });
};

export const useCashierShifts = () => {
  return useQuery({
    queryKey: ['cashier-shifts'],
    queryFn: async (): Promise<CashierShift[]> => {
      const response = await apiClient.get<CashierShift[] | { results: CashierShift[] }>('/restaurant/cashier-shifts/');
      return getList(response.data);
    },
  });
};

export const useCashierCounters = () => {
  return useQuery({
    queryKey: ['cashier-counters'],
    queryFn: async (): Promise<CashierCounter[]> => {
      const response = await apiClient.get<CashierCounter[] | { results: CashierCounter[] }>('/restaurant/cashier-counters/');
      return getList(response.data);
    },
  });
};

export const useCurrentCashierShift = () => {
  return useQuery({
    queryKey: ['cashier-shift-current'],
    queryFn: async (): Promise<CashierShift | null> => {
      const response = await apiClient.get<CashierShift | null>('/restaurant/cashier-shifts/current/');
      return response.data;
    },
  });
};

export const useCreateMenuCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<MenuCategory, 'id'>): Promise<MenuCategory> => {
      const response = await apiClient.post('/restaurant/categories/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-categories'] }),
  });
};

export const useCreateMenuItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<MenuItem, 'id' | 'category_details' | 'inventory_item_details'> | FormData): Promise<MenuItem> => {
      const response = await apiClient.post('/restaurant/items/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items'] }),
  });
};

export const useCreateMenuModifierGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<MenuModifierGroup, 'id' | 'modifiers'>): Promise<MenuModifierGroup> => {
      const response = await apiClient.post('/restaurant/modifier-groups/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-modifier-groups'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
    },
  });
};

export const useCreateMenuModifier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<MenuModifier, 'id' | 'group_name'>): Promise<MenuModifier> => {
      const response = await apiClient.post('/restaurant/modifiers/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-modifiers'] });
      queryClient.invalidateQueries({ queryKey: ['menu-modifier-groups'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
    },
  });
};

export const useCreateMenuRecipeIngredient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<MenuRecipeIngredient, 'id' | 'item_details' | 'line_cost'>): Promise<MenuRecipeIngredient> => {
      const response = await apiClient.post('/restaurant/recipe-ingredients/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-recipe-ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    },
  });
};

export const useCreateRestaurantTable = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<RestaurantTable, 'id'>): Promise<RestaurantTable> => {
      const response = await apiClient.post('/restaurant/tables/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] }),
  });
};

export const useCreateRestaurantOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { table?: string; room_booking?: string; order_type: RestaurantOrder['order_type']; notes?: string }): Promise<RestaurantOrder> => {
      const response = await apiClient.post('/restaurant/orders/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
    },
  });
};

export const useOpenCashierShift = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { counter: string; opening_cash: string; business_date?: string; notes?: string }): Promise<CashierShift> => {
      const response = await apiClient.post('/restaurant/cashier-shifts/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-shift-current'] });
    },
  });
};

export const useCreateCashierCounter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<CashierCounter, 'id'>): Promise<CashierCounter> => {
      const response = await apiClient.post('/restaurant/cashier-counters/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cashier-counters'] }),
  });
};

export const useCloseCashierShift = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shiftId, actual_cash, notes }: { shiftId: string; actual_cash: string; notes?: string }): Promise<CashierShift> => {
      const response = await apiClient.post(`/restaurant/cashier-shifts/${shiftId}/close/`, { actual_cash, notes });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-shift-current'] });
    },
  });
};

export const useRestaurantOrderAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      action,
      payload,
    }: {
      orderId: string;
      action: 'add_line' | 'send_to_kitchen' | 'mark_served' | 'split_bill' | 'transfer_table' | 'merge_table' | 'void_line' | 'apply_discount';
      payload?: Record<string, unknown>;
    }) => {
      const response = await apiClient.post(`/restaurant/orders/${orderId}/${action}/`, payload || {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
    },
  });
};

export const useRequestRestaurantOrderApproval = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      action,
      payload,
    }: {
      orderId: string;
      action: 'request_void_line' | 'request_discount' | 'request_complimentary';
      payload?: Record<string, unknown>;
    }): Promise<RestaurantOrderApproval> => {
      const response = await apiClient.post(`/restaurant/orders/${orderId}/${action}/`, payload || {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-order-approvals'] });
    },
  });
};

export const useRestaurantOrderApprovalDecision = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      approvalId,
      action,
      decision_notes,
    }: {
      approvalId: string;
      action: 'approve' | 'reject';
      decision_notes?: string;
    }): Promise<RestaurantOrderApproval> => {
      const response = await apiClient.post(`/restaurant/order-approvals/${approvalId}/${action}/`, { decision_notes });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-order-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-tickets'] });
    },
  });
};

export const useSettleRestaurantOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      payment_method,
      paid_amount,
      booking,
      cashier_shift,
    }: {
      orderId: string;
      payment_method: RestaurantOrder['payment_method'];
      paid_amount: string;
      booking?: string;
      cashier_shift?: string;
    }) => {
      const response = await apiClient.post(`/restaurant/orders/${orderId}/settle/`, {
        payment_method,
        paid_amount,
        booking,
        cashier_shift,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['guest-folios'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-shift-current'] });
    },
  });
};

export const useKitchenTicketAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, action }: { ticketId: string; action: 'start' | 'mark_ready' }) => {
      const response = await apiClient.post(`/restaurant/kitchen-tickets/${ticketId}/${action}/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
    },
  });
};
