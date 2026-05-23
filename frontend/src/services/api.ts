import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

apiClient.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('access_token');
  const tenantDomain = localStorage.getItem('tenant_domain');
  const requestUrl = config.url || '';
  const tenantScopedPrefixes = ['/tenants/settings/', '/bookings/', '/housekeeping/', '/restaurant/', '/accounting/', '/inventory/', '/hrms/', '/maintenance/', '/audit/', '/notifications/', '/payments/', '/integrations/'];
  const isTenantScopedApi = tenantScopedPrefixes.some((prefix) => requestUrl.startsWith(prefix));

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (tenantDomain && isTenantScopedApi) {
    config.headers['X-Tenant-Domain'] = tenantDomain;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          const response = await axios.post(`${apiClient.defaults.baseURL}/auth/refresh/`, {
            refresh: refreshToken,
          });
          localStorage.setItem('access_token', response.data.access);
          originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('tenant_domain');
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
