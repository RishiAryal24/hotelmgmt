import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormik } from 'formik';
import * as yup from 'yup';
import apiClient from '../services/api';

interface Tenant {
  id: string;
  name: string;
  schema_name: string;
  paid_until: string | null;
  on_trial: boolean;
  created_by: string;
  description: string;
  currency: string;
}

const currencyChoices = [
  { code: 'NPR', name: 'Nepalese Rupee' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'AED', name: 'UAE Dirham' },
];

const fetchTenants = async (): Promise<Tenant[]> => {
  const response = await apiClient.get('/tenants/');
  return response.data;
};

const createTenant = async (payload: {
  name: string;
  domain_name: string;
  currency: string;
  admin_email: string;
  admin_password: string;
}) => {
  const response = await apiClient.post('/tenants/', payload);
  return response.data;
};

const TenantOnboarding = () => {
  const queryClient = useQueryClient();
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: fetchTenants,
  });

  const mutation = useMutation({
    mutationFn: createTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      formik.resetForm();
    },
  });

  const formik = useFormik({
    initialValues: {
      name: '',
      domain_name: '',
      currency: 'NPR',
      admin_email: '',
      admin_password: '',
    },
    validationSchema: yup.object({
      name: yup.string().required('Tenant name is required'),
      domain_name: yup.string().required('Domain is required'),
      currency: yup.string().required('Currency is required'),
      admin_email: yup.string().email('Enter a valid email').required('Admin email is required'),
      admin_password: yup.string().min(12, 'Minimum 12 characters').required('Admin password is required'),
    }),
    onSubmit: (values) => mutation.mutate(values),
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Tenant Onboarding</h1>
        <p className="mt-4 text-slate-600">
          Create hotel and restaurant workspaces with isolated schemas and default Hotel Admin accounts.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Existing Tenants</h2>
          <div className="mt-4 space-y-3">
            {isLoading && <p className="text-slate-600">Loading tenants...</p>}
            {tenants?.map((tenant) => (
              <div key={tenant.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{tenant.name}</h3>
                    <p className="text-sm text-slate-500">Schema: {tenant.schema_name}</p>
                    <p className="text-sm text-slate-500">Currency: {tenant.currency}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                    {tenant.on_trial ? 'Trial' : 'Active'}
                  </span>
                </div>
              </div>
            ))}
            {tenants?.length === 0 && <p className="text-slate-600">No tenants created yet.</p>}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Tenant</h2>
          <form onSubmit={formik.handleSubmit} className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Hotel or Restaurant Name
              <input
                name="name"
                value={formik.values.name}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
              {formik.touched.name && formik.errors.name && <p className="mt-1 text-sm text-red-600">{formik.errors.name}</p>}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Currency
              <select
                name="currency"
                value={formik.values.currency}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              >
                {currencyChoices.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} - {currency.name}
                  </option>
                ))}
              </select>
              {formik.touched.currency && formik.errors.currency && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.currency}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Tenant Domain
              <input
                name="domain_name"
                placeholder="demo.localhost"
                value={formik.values.domain_name}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
              {formik.touched.domain_name && formik.errors.domain_name && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.domain_name}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Hotel Admin Email
              <input
                name="admin_email"
                type="email"
                value={formik.values.admin_email}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
              {formik.touched.admin_email && formik.errors.admin_email && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.admin_email}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Hotel Admin Password
              <input
                name="admin_password"
                type="password"
                value={formik.values.admin_password}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
              {formik.touched.admin_password && formik.errors.admin_password && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.admin_password}</p>
              )}
            </label>

            {mutation.isError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                Tenant creation failed. Check that the domain and admin email are unique.
              </p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Creating...' : 'Create Tenant'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default TenantOnboarding;
