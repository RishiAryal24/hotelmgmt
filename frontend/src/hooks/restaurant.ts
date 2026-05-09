import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { KitchenTicket, MenuCategory, MenuItem, RestaurantOrder, RestaurantTable } from '../types/restaurant';

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
    mutationFn: async (payload: Omit<MenuItem, 'id' | 'category_details'>): Promise<MenuItem> => {
      const response = await apiClient.post('/restaurant/items/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items'] }),
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
    mutationFn: async (payload: { table?: string; order_type: RestaurantOrder['order_type']; notes?: string }): Promise<RestaurantOrder> => {
      const response = await apiClient.post('/restaurant/orders/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
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
      action: 'add_line' | 'send_to_kitchen' | 'mark_served';
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

export const useSettleRestaurantOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      payment_method,
      paid_amount,
      booking,
    }: {
      orderId: string;
      payment_method: RestaurantOrder['payment_method'];
      paid_amount: string;
      booking?: string;
    }) => {
      const response = await apiClient.post(`/restaurant/orders/${orderId}/settle/`, {
        payment_method,
        paid_amount,
        booking,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['guest-folios'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
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
