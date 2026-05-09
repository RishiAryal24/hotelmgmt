import apiClient from './api';

export interface AuthPermission {
  id: string;
  name: string;
  code: string;
  module: string;
  description: string;
}

export interface AuthRole {
  id: string;
  name: string;
  code: string;
  description: string;
  permissions: AuthPermission[];
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  tenant: string | null;
  tenant_domain: string | null;
  is_active: boolean;
  is_staff: boolean;
  is_platform_admin: boolean;
  is_tenant_admin: boolean;
  roles: AuthRole[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const login = async (payload: LoginPayload) => {
  localStorage.removeItem('tenant_domain');
  const response = await apiClient.post('/auth/login/', payload);
  localStorage.setItem('access_token', response.data.access);
  localStorage.setItem('refresh_token', response.data.refresh);
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('tenant_domain');
};

export const getCurrentUser = async (): Promise<AuthUser> => {
  const response = await apiClient.get('/auth/me/');
  if (response.data.tenant_domain) {
    localStorage.setItem('tenant_domain', response.data.tenant_domain);
  } else {
    localStorage.removeItem('tenant_domain');
  }
  return response.data;
};

export const isAuthenticated = () => Boolean(localStorage.getItem('access_token'));
