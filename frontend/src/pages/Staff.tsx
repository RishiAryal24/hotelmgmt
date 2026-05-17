import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormik } from 'formik';
import * as yup from 'yup';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import apiClient from '../services/api';
import { AuthRole, AuthUser } from '../services/auth';

interface StaffUser extends AuthUser {
  roles: AuthRole[];
}

type StaffTab = 'staff' | 'roles' | 'create';

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
  const [activeTab, setActiveTab] = useState<StaffTab>('staff');
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async (payload: { email: string; full_name: string; password: string; role_ids: string[] }) => {
      const response = await apiClient.post('/auth/users/', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      formik.resetForm();
      setIsCreateStaffOpen(false);
      setActiveTab('staff');
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

  const counts = useMemo(
    () => ({
      staff: staff?.length || 0,
      activeStaff: staff?.filter((user) => user.is_active).length || 0,
      roles: roles?.length || 0,
    }),
    [roles, staff],
  );

  const toggleRole = (roleId: string) => {
    const roleIds = formik.values.role_ids.includes(roleId)
      ? formik.values.role_ids.filter((id) => id !== roleId)
      : [...formik.values.role_ids, roleId];
    formik.setFieldValue('role_ids', roleIds);
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === 'create') {
      setIsCreateStaffOpen(true);
      return;
    }
    setActiveTab(tabId as StaffTab);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Access control</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Staff & Roles</h1>
          <p className="mt-1 text-sm text-slate-600">Create staff accounts and review role assignments in compact rows.</p>
        </div>
        <button
          onClick={() => setIsCreateStaffOpen(true)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Create staff
        </button>
      </div>

      <CompactTabs
        tabs={[
          { id: 'staff', label: 'Staff', count: counts.staff },
          { id: 'roles', label: 'Roles', count: counts.roles },
          { id: 'create', label: 'New Staff' },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === 'staff' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff?.map((user) => (
                  <tr key={user.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.full_name || user.email}
                      <span className="block text-xs font-normal text-slate-500">{user.email}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {user.roles.length ? (
                          user.roles.map((role) => (
                            <span key={role.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {role.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">No roles</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {user.is_platform_admin ? 'Platform Admin' : user.is_tenant_admin ? 'Tenant Admin' : user.is_staff ? 'Staff' : 'User'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {staffLoading && <p className="p-4 text-sm text-slate-600">Loading staff...</p>}
          {staff?.length === 0 && <p className="p-4 text-sm text-slate-600">No staff accounts yet.</p>}
        </section>
      )}

      {activeTab === 'roles' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roles?.map((role) => (
                  <tr key={role.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{role.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{role.code}</td>
                    <td className="px-4 py-3 text-slate-700">{role.description || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{role.permissions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rolesLoading && <p className="p-4 text-sm text-slate-600">Loading roles...</p>}
          {roles?.length === 0 && <p className="p-4 text-sm text-slate-600">No roles configured yet.</p>}
        </section>
      )}

      {isCreateStaffOpen && (
        <ActionModal title="Create staff" onClose={() => setIsCreateStaffOpen(false)} maxWidthClassName="max-w-4xl">
        <form onSubmit={formik.handleSubmit}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Full name
              <input
                name="full_name"
                value={formik.values.full_name}
                onChange={formik.handleChange}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              {formik.touched.full_name && formik.errors.full_name && <p className="mt-1 text-xs text-red-600">{formik.errors.full_name}</p>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Email
              <input
                name="email"
                type="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              {formik.touched.email && formik.errors.email && <p className="mt-1 text-xs text-red-600">{formik.errors.email}</p>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Temporary password
              <input
                name="password"
                type="password"
                value={formik.values.password}
                onChange={formik.handleChange}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              {formik.touched.password && formik.errors.password && <p className="mt-1 text-xs text-red-600">{formik.errors.password}</p>}
            </label>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-12"></th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roles?.map((role) => (
                  <tr key={role.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={formik.values.role_ids.includes(role.id)} onChange={() => toggleRole(role.id)} />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{role.name}</td>
                    <td className="px-3 py-2 text-slate-700">{role.description || '-'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{role.permissions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rolesLoading && <p className="p-4 text-sm text-slate-600">Loading roles...</p>}
          </div>
          {formik.touched.role_ids && typeof formik.errors.role_ids === 'string' && (
            <p className="mt-2 text-sm text-red-600">{formik.errors.role_ids}</p>
          )}
          {mutation.isError && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              Staff creation failed. Check that the email is unique and roles are valid.
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsCreateStaffOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Creating...' : 'Create staff'}
            </button>
          </div>
        </form>
        </ActionModal>
      )}
    </div>
  );
};

export default Staff;
