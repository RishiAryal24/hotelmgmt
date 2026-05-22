import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';
import { Attendance, Employee, PayrollPeriod, PayrollRun, Shift } from '../types/hrms';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useEmployees = () => {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async (): Promise<Employee[]> => {
      const response = await apiClient.get<Employee[] | { results: Employee[] }>('/hrms/employees/');
      return getList(response.data);
    },
  });
};

export const useCreateEmployee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Employee, 'id' | 'full_name' | 'user_details'>): Promise<Employee> => {
      const response = await apiClient.post('/hrms/employees/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
};

export const useUpdateEmployee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, payload }: { employeeId: string; payload: Partial<Employee> }): Promise<Employee> => {
      const response = await apiClient.patch(`/hrms/employees/${employeeId}/`, payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
};

export const useShifts = () => {
  return useQuery({
    queryKey: ['hrms-shifts'],
    queryFn: async (): Promise<Shift[]> => {
      const response = await apiClient.get<Shift[] | { results: Shift[] }>('/hrms/shifts/');
      return getList(response.data);
    },
  });
};

export const useCreateShift = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Shift, 'id'>): Promise<Shift> => {
      const response = await apiClient.post('/hrms/shifts/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hrms-shifts'] }),
  });
};

export const useAttendance = () => {
  return useQuery({
    queryKey: ['hrms-attendance'],
    queryFn: async (): Promise<Attendance[]> => {
      const response = await apiClient.get<Attendance[] | { results: Attendance[] }>('/hrms/attendance/');
      return getList(response.data);
    },
  });
};

export const useCreateAttendance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      employee: string;
      shift?: string | null;
      attendance_date: string;
      status: Attendance['status'];
      notes?: string;
    }): Promise<Attendance> => {
      const response = await apiClient.post('/hrms/attendance/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hrms-attendance'] }),
  });
};

export const useClockIn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { employee: string; shift?: string | null; attendance_date?: string }): Promise<Attendance> => {
      const response = await apiClient.post('/hrms/attendance/clock-in/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hrms-attendance'] }),
  });
};

export const useClockOut = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attendanceId: string): Promise<Attendance> => {
      const response = await apiClient.post(`/hrms/attendance/${attendanceId}/clock-out/`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hrms-attendance'] }),
  });
};

export const usePayrollPeriods = () => {
  return useQuery({
    queryKey: ['payroll-periods'],
    queryFn: async (): Promise<PayrollPeriod[]> => {
      const response = await apiClient.get<PayrollPeriod[] | { results: PayrollPeriod[] }>('/hrms/payroll-periods/');
      return getList(response.data);
    },
  });
};

export const useCreatePayrollPeriod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<PayrollPeriod, 'id' | 'status'> & { status?: PayrollPeriod['status'] }): Promise<PayrollPeriod> => {
      const response = await apiClient.post('/hrms/payroll-periods/', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-periods'] }),
  });
};

export const usePayrollRuns = () => {
  return useQuery({
    queryKey: ['payroll-runs'],
    queryFn: async (): Promise<PayrollRun[]> => {
      const response = await apiClient.get<PayrollRun[] | { results: PayrollRun[] }>('/hrms/payroll-runs/');
      return getList(response.data);
    },
  });
};

export const useGeneratePayrollRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (period: string): Promise<PayrollRun> => {
      const response = await apiClient.post('/hrms/payroll-runs/generate/', { period });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] });
    },
  });
};

export const useApprovePayrollRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payrollRunId: string): Promise<PayrollRun> => {
      const response = await apiClient.post(`/hrms/payroll-runs/${payrollRunId}/approve/`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });
};

export const useCancelPayrollRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payrollRunId: string): Promise<void> => {
      await apiClient.post(`/hrms/payroll-runs/${payrollRunId}/cancel/`);
    },
    onSuccess: (_data, payrollRunId) => {
      queryClient.setQueryData<PayrollRun[]>(['payroll-runs'], (current) =>
        current?.filter((payrollRun) => payrollRun.id !== payrollRunId) || [],
      );
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] });
    },
  });
};

export const usePostPayrollRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payrollRunId: string): Promise<PayrollRun> => {
      const response = await apiClient.post(`/hrms/payroll-runs/${payrollRunId}/post/`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });
};

export const useSettlePayrollRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      payrollRunId,
      payment_method,
      payment_reference,
    }: {
      payrollRunId: string;
      payment_method: 'cash' | 'bank_transfer' | 'cheque';
      payment_reference?: string;
    }): Promise<PayrollRun> => {
      const response = await apiClient.post(`/hrms/payroll-runs/${payrollRunId}/settle/`, {
        payment_method,
        payment_reference,
      });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });
};

export const useReversePayrollRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ payrollRunId, reason }: { payrollRunId: string; reason?: string }): Promise<PayrollRun> => {
      const response = await apiClient.post(`/hrms/payroll-runs/${payrollRunId}/reverse/`, { reason });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};
