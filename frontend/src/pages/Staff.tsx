import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormik } from 'formik';
import * as yup from 'yup';
import apiClient from '../services/api';
import { AuthRole, AuthUser } from '../services/auth';

interface StaffUser extends AuthUser {
  roles: AuthRole[];
}

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

const fetchStaff = async (): Promise<StaffUser[]> => {
  const response = await apiClient.get<StaffUser[] | { results: StaffUser[] }>('/auth/users/');
  return getList(response.data);
};

const fetchRoles = async (): Promise<AuthRole[]> => {
  const response = await apiClient.get<AuthRole[] | { results: AuthRole[] }>('/auth/roles/');
  return getList(response.data);
};

const Staff = () => {
  const queryClient = useQueryClient();
  const { data: staff, isLoading: staffLoading } = useQuery({ queryKey: ['staff'], queryFn: fetchStaff });
  const { data: roles, isLoading: rolesLoading } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });

  const mutation = useMutation({
    mutationFn: async (payload: { email: string; full_name: string; password: string; role_ids: string[] }) => {
      const response = await apiClient.post('/auth/users/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      formik.resetForm();
    },
  });

  const formik = useFormik({
    initialValues: {
      email: '',
      full_name: '',
      password: '',
      role_ids: [] as string[],
    },
    validationSchema: yup.object({
      email: yup.string().email('Enter a valid email').required('Email is required'),
      full_name: yup.string().required('Full name is required'),
      password: yup.string().min(12, 'Minimum 12 characters').required('Password is required'),
      role_ids: yup.array().of(yup.string()).min(1, 'Select at least one role'),
    }),
    onSubmit: (values) => mutation.mutate(values),
  });

  const toggleRole = (roleId: string) => {
    const roleIds = formik.values.role_ids.includes(roleId)
      ? formik.values.role_ids.filter((id) => id !== roleId)
      : [...formik.values.role_ids, roleId];
    formik.setFieldValue('role_ids', roleIds);
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Staff & Roles</h1>
        <p className="mt-4 text-slate-600">Create staff accounts and assign operational roles for this tenant.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Staff Accounts</h2>
          <div className="mt-4 space-y-3">
            {staffLoading && <p className="text-slate-600">Loading staff...</p>}
            {staff?.map((user) => (
              <div key={user.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{user.full_name || user.email}</h3>
                    <p className="text-sm text-slate-500">{user.email}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                    {user.is_tenant_admin ? 'Tenant Admin' : 'Staff'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <span key={role.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {staff?.length === 0 && <p className="text-slate-600">No staff accounts yet.</p>}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Staff</h2>
          <form onSubmit={formik.handleSubmit} className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Full Name
              <input
                name="full_name"
                value={formik.values.full_name}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
              {formik.touched.full_name && formik.errors.full_name && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.full_name}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                name="email"
                type="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
              {formik.touched.email && formik.errors.email && <p className="mt-1 text-sm text-red-600">{formik.errors.email}</p>}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Temporary Password
              <input
                name="password"
                type="password"
                value={formik.values.password}
                onChange={formik.handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
              {formik.touched.password && formik.errors.password && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.password}</p>
              )}
            </label>

            <div>
              <p className="text-sm font-medium text-slate-700">Roles</p>
              <div className="mt-2 grid gap-2">
                {rolesLoading && <p className="text-sm text-slate-600">Loading roles...</p>}
                {roles?.map((role) => (
                  <label key={role.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={formik.values.role_ids.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{role.name}</span>
                      <span className="block text-xs text-slate-500">{role.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {formik.touched.role_ids && typeof formik.errors.role_ids === 'string' && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.role_ids}</p>
              )}
            </div>

            {mutation.isError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                Staff creation failed. Check that the email is unique and roles are valid.
              </p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Creating...' : 'Create Staff'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Staff;
