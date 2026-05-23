import apiClient from './api';

export interface CurrencyChoice {
  code: string;
  name: string;
}

export interface TenantSettings {
  id: string;
  name: string;
  schema_name: string;
  currency: string;
  currency_choices: CurrencyChoice[];
  notification_settings: Record<string, any>;
  payment_settings: Record<string, any>;
}

export const getTenantSettings = async (): Promise<TenantSettings> => {
  const response = await apiClient.get('/tenants/settings/');
  return response.data;
};

export const updateTenantSettings = async (payload: Partial<Pick<TenantSettings, 'currency' | 'notification_settings' | 'payment_settings'>>): Promise<TenantSettings> => {
  const response = await apiClient.patch('/tenants/settings/', payload);
  return response.data;
};

export const formatMoney = (value: string | number | undefined, currency = 'NPR') => {
  const numericValue = Number(value || 0);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(numericValue);
};
