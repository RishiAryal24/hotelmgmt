import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import {
  useAttendance,
  useClockIn,
  useClockOut,
  useCreateAttendance,
  useCreateEmployee,
  useCreatePayrollPeriod,
  useCreateShift,
  useEmployees,
  useGeneratePayrollRun,
  usePayrollPeriods,
  usePayrollRuns,
  usePostPayrollRun,
  useApprovePayrollRun,
  useCancelPayrollRun,
  useReversePayrollRun,
  useSettlePayrollRun,
  useShifts,
  useUpdateEmployee,
} from '../hooks/hrms';
import { usePermissions } from '../hooks/permissions';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { Attendance, Employee, PayrollLine, PayrollPeriod, PayrollRun, Shift } from '../types/hrms';
import { downloadCsv } from '../utils/csv';

const today = new Date().toISOString().slice(0, 10);

const emptyEmployee: Omit<Employee, 'id' | 'full_name' | 'user_details'> = {
  employee_id: '',
  user: null,
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  department: '',
  designation: '',
  employment_type: 'full_time',
  status: 'active',
  hire_date: today,
  salary: '0.00',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  notes: '',
};

const emptyShift: Omit<Shift, 'id'> = {
  name: '',
  start_time: '08:00',
  end_time: '16:00',
  break_minutes: 30,
  grace_minutes: 10,
  is_active: true,
  notes: '',
};

const emptyPayrollPeriod: Omit<PayrollPeriod, 'id' | 'status'> = {
  name: '',
  start_date: today.slice(0, 8) + '01',
  end_date: today,
  notes: '',
};

type HRTab = 'employees' | 'attendance' | 'exceptions' | 'shifts' | 'payroll' | 'labor' | 'create';
type AttendanceExceptionType = 'all' | 'late' | 'absent' | 'half_day' | 'missing_clock_out';

const employeeStatusClass: Record<Employee['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  on_leave: 'bg-amber-50 text-amber-700',
  inactive: 'bg-slate-100 text-slate-700',
  terminated: 'bg-rose-50 text-rose-700',
};

const attendanceStatusClass: Record<Attendance['status'], string> = {
  scheduled: 'bg-slate-100 text-slate-700',
  present: 'bg-emerald-50 text-emerald-700',
  late: 'bg-amber-50 text-amber-700',
  absent: 'bg-rose-50 text-rose-700',
  half_day: 'bg-sky-50 text-sky-700',
  on_leave: 'bg-violet-50 text-violet-700',
};

const payrollStatusClass = {
  draft: 'bg-slate-100 text-slate-700',
  approved: 'bg-sky-50 text-sky-700',
  posted: 'bg-emerald-50 text-emerald-700',
  paid: 'bg-teal-50 text-teal-700',
  canceled: 'bg-rose-50 text-rose-700',
  reversed: 'bg-rose-50 text-rose-700',
};

const formatTime = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

type PayslipSelection = {
  run: PayrollRun;
  line: PayrollLine;
};

type AttendanceExceptionRow = {
  id: string;
  employee: string;
  employeeId: string;
  department: string;
  date: string;
  shift: string;
  type: 'Late' | 'Absent' | 'Half Day' | 'Missing Clock-out';
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: string;
  notes: string;
};

type DepartmentLaborRow = {
  department: string;
  employees: number;
  payrollRuns: number;
  payableDays: number;
  presentDays: number;
  leaveDays: number;
  absentDays: number;
  grossPay: number;
  allowances: number;
  overtimePay: number;
  attendanceDeduction: number;
  otherDeductions: number;
  deductions: number;
  netPay: number;
  averageNetPay: number;
};

type DepartmentLaborAccumulator = Omit<DepartmentLaborRow, 'employees' | 'payrollRuns' | 'averageNetPay'> & {
  employeeIds: Set<string>;
  payrollRunIds: Set<string>;
};

const toNumber = (value: string | number | undefined | null) => Number(value || 0);

const HRMS = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: employees, isLoading: employeesLoading, error: employeesError } = useEmployees();
  const { data: shifts, isLoading: shiftsLoading } = useShifts();
  const { data: attendance, isLoading: attendanceLoading } = useAttendance();
  const { data: payrollPeriods, isLoading: periodsLoading } = usePayrollPeriods();
  const { data: payrollRuns, isLoading: payrollRunsLoading } = usePayrollRuns();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const createShift = useCreateShift();
  const createAttendance = useCreateAttendance();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const createPayrollPeriod = useCreatePayrollPeriod();
  const generatePayrollRun = useGeneratePayrollRun();
  const approvePayrollRun = useApprovePayrollRun();
  const cancelPayrollRun = useCancelPayrollRun();
  const postPayrollRun = usePostPayrollRun();
  const reversePayrollRun = useReversePayrollRun();
  const settlePayrollRun = useSettlePayrollRun();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState<HRTab>('employees');
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [shiftForm, setShiftForm] = useState(emptyShift);
  const [payrollPeriodForm, setPayrollPeriodForm] = useState(emptyPayrollPeriod);
  const [payrollSettlementForms, setPayrollSettlementForms] = useState<Record<string, { payment_method: 'cash' | 'bank_transfer' | 'cheque'; payment_reference: string }>>({});
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipSelection | null>(null);
  const [selectedPayslipRun, setSelectedPayslipRun] = useState<PayrollRun | null>(null);
  const [reversingPayrollRun, setReversingPayrollRun] = useState<PayrollRun | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [attendanceExceptionType, setAttendanceExceptionType] = useState<AttendanceExceptionType>('all');
  const [attendanceDateFrom, setAttendanceDateFrom] = useState(today.slice(0, 8) + '01');
  const [attendanceDateTo, setAttendanceDateTo] = useState(today);
  const [attendanceExceptionReportOpen, setAttendanceExceptionReportOpen] = useState(false);
  const [laborPeriodFilter, setLaborPeriodFilter] = useState('all');
  const [laborReportOpen, setLaborReportOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState({
    employee: '',
    shift: '',
    attendance_date: today,
    status: 'scheduled' as Attendance['status'],
    notes: '',
  });

  const todaysAttendance = useMemo(
    () => (attendance || []).filter((record) => record.attendance_date === today),
    [attendance],
  );
  const activePayrollRuns = useMemo(
    () => (payrollRuns || []).filter((run) => run.status !== 'canceled'),
    [payrollRuns],
  );
  const laborPayrollRuns = useMemo(
    () => activePayrollRuns.filter((run) => laborPeriodFilter === 'all' || run.period === laborPeriodFilter),
    [activePayrollRuns, laborPeriodFilter],
  );
  const departmentLaborRows = useMemo<DepartmentLaborRow[]>(() => {
    const rows = new Map<string, DepartmentLaborAccumulator>();

    laborPayrollRuns.forEach((run) => {
      run.lines.forEach((line) => {
        const department = line.employee_details?.department || 'Unassigned';
        const current = rows.get(department) || {
          department,
          employeeIds: new Set<string>(),
          payrollRunIds: new Set<string>(),
          payableDays: 0,
          presentDays: 0,
          leaveDays: 0,
          absentDays: 0,
          grossPay: 0,
          allowances: 0,
          overtimePay: 0,
          attendanceDeduction: 0,
          otherDeductions: 0,
          deductions: 0,
          netPay: 0,
        };

        current.employeeIds.add(line.employee);
        current.payrollRunIds.add(run.id);
        current.payableDays += toNumber(line.payable_days);
        current.presentDays += toNumber(line.present_days);
        current.leaveDays += toNumber(line.leave_days);
        current.absentDays += toNumber(line.absent_days);
        current.grossPay += toNumber(line.gross_pay);
        current.allowances += toNumber(line.allowances);
        current.overtimePay += toNumber(line.overtime_pay);
        current.attendanceDeduction += toNumber(line.attendance_deduction);
        current.otherDeductions += toNumber(line.other_deductions);
        current.deductions += toNumber(line.deductions);
        current.netPay += toNumber(line.net_pay);
        rows.set(department, current);
      });
    });

    return Array.from(rows.values())
      .map((row) => ({
        department: row.department,
        employees: row.employeeIds.size,
        payrollRuns: row.payrollRunIds.size,
        payableDays: row.payableDays,
        presentDays: row.presentDays,
        leaveDays: row.leaveDays,
        absentDays: row.absentDays,
        grossPay: row.grossPay,
        allowances: row.allowances,
        overtimePay: row.overtimePay,
        attendanceDeduction: row.attendanceDeduction,
        otherDeductions: row.otherDeductions,
        deductions: row.deductions,
        netPay: row.netPay,
        averageNetPay: row.employeeIds.size ? row.netPay / row.employeeIds.size : 0,
      }))
      .sort((a, b) => b.netPay - a.netPay);
  }, [laborPayrollRuns]);
  const laborTotals = useMemo(
    () =>
      departmentLaborRows.reduce(
        (total, row) => ({
          departments: total.departments + 1,
          employees: total.employees + row.employees,
          payrollRuns: Math.max(total.payrollRuns, row.payrollRuns),
          payableDays: total.payableDays + row.payableDays,
          presentDays: total.presentDays + row.presentDays,
          leaveDays: total.leaveDays + row.leaveDays,
          absentDays: total.absentDays + row.absentDays,
          grossPay: total.grossPay + row.grossPay,
          deductions: total.deductions + row.deductions,
          netPay: total.netPay + row.netPay,
        }),
        {
          departments: 0,
          employees: 0,
          payrollRuns: 0,
          payableDays: 0,
          presentDays: 0,
          leaveDays: 0,
          absentDays: 0,
          grossPay: 0,
          deductions: 0,
          netPay: 0,
        },
      ),
    [departmentLaborRows],
  );
  const attendanceExceptionRows = useMemo<AttendanceExceptionRow[]>(() => {
    const isInRange = (date: string) => {
      if (attendanceDateFrom && date < attendanceDateFrom) return false;
      if (attendanceDateTo && date > attendanceDateTo) return false;
      return true;
    };

    return (attendance || [])
      .filter((record) => isInRange(record.attendance_date))
      .flatMap((record) => {
        const rows: AttendanceExceptionRow[] = [];
        const base = {
          id: record.id,
          employee: record.employee_details?.full_name || 'Employee',
          employeeId: record.employee_details?.employee_id || '-',
          department: record.employee_details?.department || '-',
          date: record.attendance_date,
          shift: record.shift_details?.name || '-',
          clockIn: record.clock_in,
          clockOut: record.clock_out,
          hoursWorked: record.hours_worked,
          notes: record.notes,
        };

        if (record.status === 'late') rows.push({ ...base, type: 'Late' });
        if (record.status === 'absent') rows.push({ ...base, type: 'Absent' });
        if (record.status === 'half_day') rows.push({ ...base, type: 'Half Day' });
        if (record.clock_in && !record.clock_out) rows.push({ ...base, type: 'Missing Clock-out' });

        return rows;
      })
      .filter((row) => attendanceExceptionType === 'all' || row.type.toLowerCase().replace(/[- ]/g, '_') === attendanceExceptionType)
      .sort((a, b) => b.date.localeCompare(a.date) || a.employee.localeCompare(b.employee));
  }, [attendance, attendanceDateFrom, attendanceDateTo, attendanceExceptionType]);

  const counts = useMemo(
    () => ({
      employees: employees?.length || 0,
      active: employees?.filter((employee) => employee.status === 'active').length || 0,
      presentToday: todaysAttendance.filter((record) => ['present', 'late'].includes(record.status)).length,
      attendanceExceptions: attendanceExceptionRows.length,
      shifts: shifts?.filter((shift) => shift.is_active).length || 0,
      payrollRuns: activePayrollRuns.length,
      laborDepartments: departmentLaborRows.length,
    }),
    [activePayrollRuns.length, attendanceExceptionRows.length, departmentLaborRows.length, employees, shifts, todaysAttendance],
  );

  const handleEmployeeSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createEmployee.mutate(employeeForm, {
      onSuccess: () => {
        setEmployeeForm(emptyEmployee);
        setIsEmployeeModalOpen(false);
        setActiveTab('employees');
      },
    });
  };

  const handleShiftSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createShift.mutate(shiftForm, {
      onSuccess: () => setShiftForm(emptyShift),
    });
  };

  const handleAttendanceSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createAttendance.mutate(
      {
        ...attendanceForm,
        shift: attendanceForm.shift || null,
      },
      {
        onSuccess: () => setAttendanceForm({ employee: '', shift: '', attendance_date: today, status: 'scheduled', notes: '' }),
      },
    );
  };

  const handlePayrollPeriodSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createPayrollPeriod.mutate(payrollPeriodForm, {
      onSuccess: () => setPayrollPeriodForm(emptyPayrollPeriod),
    });
  };

  const getSettlementForm = (runId: string) => payrollSettlementForms[runId] || { payment_method: 'bank_transfer' as const, payment_reference: '' };

  const updateSettlementForm = (
    runId: string,
    patch: Partial<{ payment_method: 'cash' | 'bank_transfer' | 'cheque'; payment_reference: string }>,
  ) => {
    setPayrollSettlementForms((current) => ({
      ...current,
      [runId]: {
        ...(current[runId] || { payment_method: 'bank_transfer' as const, payment_reference: '' }),
        ...patch,
      },
    }));
  };

  const exportPayrollCsv = () => {
    const rows = activePayrollRuns.flatMap((run) =>
      run.lines.map((line) => [
        run.period_details?.name || '',
        run.period_details?.start_date || '',
        run.period_details?.end_date || '',
        run.status,
        run.payment_method || '',
        run.payment_reference || '',
        run.journal_entry_number || '',
        run.payment_journal_entry_number || '',
        line.employee_details?.employee_id || '',
        line.employee_details?.full_name || '',
        line.employee_details?.department || '',
        line.employee_details?.designation || '',
        line.base_salary,
        line.payable_days,
        line.present_days,
        line.leave_days,
        line.absent_days,
        line.gross_pay,
        line.allowances,
        line.overtime_pay,
        line.attendance_deduction,
        line.other_deductions,
        line.deductions,
        line.net_pay,
      ]),
    );
    downloadCsv(
      `payroll-report-${today}.csv`,
      [
        'Period',
        'Start Date',
        'End Date',
        'Run Status',
        'Payment Method',
        'Payment Reference',
        'Posting Journal',
        'Payment Journal',
        'Employee ID',
        'Employee',
        'Department',
        'Designation',
        'Base Salary',
        'Payable Days',
        'Present Days',
        'Leave Days',
        'Absent Days',
        'Gross Pay',
        'Allowances',
        'Overtime Pay',
        'Attendance Deduction',
        'Other Deductions',
        'Total Deductions',
        'Net Pay',
      ],
      rows,
    );
  };

  const exportAttendanceExceptionsCsv = () => {
    downloadCsv(
      `attendance-exceptions-${attendanceDateFrom || 'all'}-${attendanceDateTo || today}.csv`,
      ['Type', 'Date', 'Employee ID', 'Employee', 'Department', 'Shift', 'Clock In', 'Clock Out', 'Hours', 'Notes'],
      attendanceExceptionRows.map((row) => [
        row.type,
        row.date,
        row.employeeId,
        row.employee,
        row.department,
        row.shift,
        row.clockIn || '',
        row.clockOut || '',
        row.hoursWorked,
        row.notes,
      ]),
    );
  };

  const exportLaborCostCsv = () => {
    downloadCsv(
      `department-labor-cost-${laborPeriodFilter === 'all' ? today : laborPeriodFilter}.csv`,
      [
        'Department',
        'Employees',
        'Payroll Runs',
        'Payable Days',
        'Present Days',
        'Leave Days',
        'Absent Days',
        'Gross Pay',
        'Allowances',
        'Overtime Pay',
        'Attendance Deduction',
        'Other Deductions',
        'Total Deductions',
        'Net Pay',
        'Average Net Pay',
      ],
      departmentLaborRows.map((row) => [
        row.department,
        row.employees,
        row.payrollRuns,
        row.payableDays,
        row.presentDays,
        row.leaveDays,
        row.absentDays,
        row.grossPay,
        row.allowances,
        row.overtimePay,
        row.attendanceDeduction,
        row.otherDeductions,
        row.deductions,
        row.netPay,
        row.averageNetPay,
      ]),
    );
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === 'create') {
      setIsEmployeeModalOpen(true);
      return;
    }
    setActiveTab(tabId as HRTab);
  };

  if (employeesLoading || shiftsLoading || attendanceLoading || periodsLoading || payrollRunsLoading) return <div className="p-6 text-slate-600">Loading HRMS...</div>;
  if (employeesError) return <div className="p-6 text-red-600">Error loading HRMS records</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Human resources</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">HRMS</h1>
          <p className="mt-1 text-sm text-slate-600">Employee records, shifts, and daily attendance.</p>
        </div>
        {can('hrms.employee.create') && (
          <button
            onClick={() => setIsEmployeeModalOpen(true)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add employee
          </button>
        )}
      </div>

      <CompactTabs
        tabs={[
          { id: 'employees', label: 'Employees', count: counts.employees },
          { id: 'attendance', label: 'Attendance', count: counts.presentToday },
          { id: 'exceptions', label: 'Exceptions', count: counts.attendanceExceptions },
          { id: 'shifts', label: 'Shifts', count: counts.shifts },
          { id: 'payroll', label: 'Payroll', count: counts.payrollRuns },
          { id: 'labor', label: 'Labor Cost', count: counts.laborDepartments },
          ...(can('hrms.employee.create') ? [{ id: 'create', label: 'New Employee' }] : []),
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === 'employees' && (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['Employees', counts.employees, 'Total records'],
              ['Active', counts.active, 'Currently working'],
              ['Present Today', counts.presentToday, 'Clocked in'],
              ['Active Shifts', counts.shifts, 'Available rosters'],
            ].map(([title, value, detail]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-2 text-2xl font-semibold text-[#1F5E3B]">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </article>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Hire Date</th>
                    <th className="px-4 py-3 text-right">Salary</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(employees || []).map((employee) => (
                    <tr key={employee.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {employee.full_name}
                        <span className="block text-xs font-normal text-slate-500">{employee.employee_id} - {employee.designation}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{employee.department}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {employee.phone || '-'}
                        <span className="block text-xs text-slate-500">{employee.email || 'No email'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{employee.hire_date}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(employee.salary, settings?.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${employeeStatusClass[employee.status]}`}>
                          {employee.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {can('hrms.employee.create') && employee.status !== 'on_leave' && employee.status !== 'terminated' && (
                            <button
                              onClick={() => updateEmployee.mutate({ employeeId: employee.id, payload: { status: 'on_leave' } })}
                              className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                            >
                              Leave
                            </button>
                          )}
                          {can('hrms.employee.create') && employee.status !== 'active' && employee.status !== 'terminated' && (
                            <button
                              onClick={() => updateEmployee.mutate({ employeeId: employee.id, payload: { status: 'active' } })}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Active
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'attendance' && (
        <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
          {can('hrms.attendance.create') && <form onSubmit={handleAttendanceSubmit} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Schedule attendance</h2>
            <div className="mt-4 grid gap-3">
              <select value={attendanceForm.employee} onChange={(e) => setAttendanceForm({ ...attendanceForm, employee: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                <option value="">Select employee</option>
                {(employees || []).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                ))}
              </select>
              <select value={attendanceForm.shift} onChange={(e) => setAttendanceForm({ ...attendanceForm, shift: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">No shift</option>
                {(shifts || []).map((shift) => (
                  <option key={shift.id} value={shift.id}>{shift.name}</option>
                ))}
              </select>
              <input type="date" value={attendanceForm.attendance_date} onChange={(e) => setAttendanceForm({ ...attendanceForm, attendance_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <select value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value as Attendance['status'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="scheduled">Scheduled</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="half_day">Half Day</option>
                <option value="on_leave">On Leave</option>
              </select>
              <textarea placeholder="Notes" value={attendanceForm.notes} onChange={(e) => setAttendanceForm({ ...attendanceForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Save attendance
              </button>
            </div>
          </form>}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-900">Attendance log</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3">Clock In</th>
                    <th className="px-4 py-3">Clock Out</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(attendance || []).map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {record.employee_details?.full_name || 'Employee'}
                        <span className="block text-xs font-normal text-slate-500">{record.employee_details?.department || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{record.attendance_date}</td>
                      <td className="px-4 py-3 text-slate-700">{record.shift_details?.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{formatTime(record.clock_in)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatTime(record.clock_out)}</td>
                      <td className="px-4 py-3 text-slate-700">{record.hours_worked}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${attendanceStatusClass[record.status]}`}>
                          {record.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {can('hrms.attendance.create') && !record.clock_in && (
                            <button onClick={() => clockIn.mutate({ employee: record.employee, shift: record.shift, attendance_date: record.attendance_date })} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                              Clock in
                            </button>
                          )}
                          {can('hrms.attendance.create') && record.clock_in && !record.clock_out && (
                            <button onClick={() => clockOut.mutate(record.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                              Clock out
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(attendance || []).length === 0 && <p className="p-4 text-sm text-slate-600">No attendance records yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'exceptions' && (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['Exceptions', attendanceExceptionRows.length, 'Filtered attendance issues'],
              ['Late', attendanceExceptionRows.filter((row) => row.type === 'Late').length, 'Arrived after grace period'],
              ['Absent/Half Day', attendanceExceptionRows.filter((row) => row.type === 'Absent' || row.type === 'Half Day').length, 'Payroll-impacting records'],
              ['Missing Clock-out', attendanceExceptionRows.filter((row) => row.type === 'Missing Clock-out').length, 'Open attendance records'],
            ].map(([title, value, detail]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-2 text-2xl font-semibold text-[#1F5E3B]">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <label className="text-xs font-semibold uppercase text-slate-500">
              Type
              <select
                value={attendanceExceptionType}
                onChange={(event) => setAttendanceExceptionType(event.target.value as AttendanceExceptionType)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case text-slate-800"
              >
                <option value="all">All exceptions</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="half_day">Half day</option>
                <option value="missing_clock_out">Missing clock-out</option>
              </select>
            </label>
            <label className="text-xs font-semibold uppercase text-slate-500">
              From
              <input
                type="date"
                value={attendanceDateFrom}
                onChange={(event) => setAttendanceDateFrom(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <label className="text-xs font-semibold uppercase text-slate-500">
              To
              <input
                type="date"
                value={attendanceDateTo}
                onChange={(event) => setAttendanceDateTo(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={exportAttendanceExceptionsCsv} className="rounded-xl bg-[#1F5E3B] px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
                Export CSV
              </button>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={() => setAttendanceExceptionReportOpen(true)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Print / PDF
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3 text-right">Clock In</th>
                    <th className="px-4 py-3 text-right">Clock Out</th>
                    <th className="px-4 py-3 text-right">Hours</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceExceptionRows.map((row) => (
                    <tr key={`${row.id}-${row.type}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{row.type}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.employee}
                        <span className="block text-xs font-normal text-slate-500">{row.employeeId} - {row.department}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.date}</td>
                      <td className="px-4 py-3 text-slate-700">{row.shift}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatTime(row.clockIn)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatTime(row.clockOut)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.hoursWorked}</td>
                      <td className="px-4 py-3 text-slate-700">{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!attendanceExceptionRows.length && <p className="p-4 text-sm text-slate-600">No attendance exceptions match the current filters.</p>}
          </div>
        </section>
      )}

      {activeTab === 'shifts' && (
        <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
          {can('hrms.shift.create') && <form onSubmit={handleShiftSubmit} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Create shift</h2>
            <div className="mt-4 grid gap-3">
              <input placeholder="Shift name" value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <div className="grid grid-cols-2 gap-3">
                <input type="time" value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input type="time" value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min="0" value={shiftForm.break_minutes} onChange={(e) => setShiftForm({ ...shiftForm, break_minutes: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input type="number" min="0" value={shiftForm.grace_minutes} onChange={(e) => setShiftForm({ ...shiftForm, grace_minutes: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={shiftForm.is_active} onChange={(e) => setShiftForm({ ...shiftForm, is_active: e.target.checked })} />
                Active shift
              </label>
              <textarea placeholder="Notes" value={shiftForm.notes} onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Save shift
              </button>
            </div>
          </form>}

          <div className="grid gap-3 md:grid-cols-2">
            {(shifts || []).map((shift) => (
              <article key={shift.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{shift.name}</h2>
                    <p className="mt-1 text-sm text-slate-600">{shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${shift.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {shift.is_active ? 'active' : 'inactive'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Break</p>
                    <p className="font-medium text-slate-900">{shift.break_minutes} min</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Grace</p>
                    <p className="font-medium text-slate-900">{shift.grace_minutes} min</p>
                  </div>
                </div>
                {shift.notes && <p className="mt-3 text-sm text-slate-600">{shift.notes}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'payroll' && (
        <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            {can('hrms.payroll.create') && <form onSubmit={handlePayrollPeriodSubmit} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">Create payroll period</h2>
              <div className="mt-4 grid gap-3">
                <input placeholder="Period name" value={payrollPeriodForm.name} onChange={(e) => setPayrollPeriodForm({ ...payrollPeriodForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={payrollPeriodForm.start_date} onChange={(e) => setPayrollPeriodForm({ ...payrollPeriodForm, start_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                  <input type="date" value={payrollPeriodForm.end_date} onChange={(e) => setPayrollPeriodForm({ ...payrollPeriodForm, end_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                </div>
                <textarea placeholder="Notes" value={payrollPeriodForm.notes} onChange={(e) => setPayrollPeriodForm({ ...payrollPeriodForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                  Save period
                </button>
              </div>
            </form>}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">Periods</h2>
              <div className="mt-3 space-y-2">
                {(payrollPeriods || []).map((period) => (
                  <div key={period.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{period.name}</p>
                      <p className="text-xs text-slate-500">{period.start_date} to {period.end_date}</p>
                    </div>
                    {can('hrms.payroll.create') && <button onClick={() => generatePayrollRun.mutate(period.id)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                      Generate
                    </button>}
                  </div>
                ))}
                {(payrollPeriods || []).length === 0 && <p className="text-sm text-slate-600">No payroll periods yet.</p>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={exportPayrollCsv}
                className="rounded-xl bg-[#1F5E3B] px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Export Payroll CSV
              </button>
            </div>
            {activePayrollRuns.map((run) => (
              <article key={run.id} className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{run.period_details?.name || 'Payroll run'}</h2>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${payrollStatusClass[run.status]}`}>
                        {run.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Net payroll {formatMoney(run.total_net_pay, settings?.currency)}
                      {run.journal_entry_number ? ` - ${run.journal_entry_number}` : ''}
                      {run.payment_journal_entry_number ? ` - Paid ${run.payment_journal_entry_number}` : ''}
                      {run.reversal_journal_entry_number ? ` - Reversed ${run.reversal_journal_entry_number}` : ''}
                    </p>
                    {run.reversal_reason && <p className="mt-1 text-xs text-rose-700">Reversal: {run.reversal_reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    {run.lines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedPayslipRun(run)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Print Payslips
                      </button>
                    )}
                    {can('hrms.payroll.create') && ['draft', 'approved'].includes(run.status) && (
                      <button
                        onClick={() => cancelPayrollRun.mutate(run.id)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Cancel
                      </button>
                    )}
                    {can('hrms.payroll.approve') && run.status === 'draft' && (
                      <button onClick={() => approvePayrollRun.mutate(run.id)} className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50">
                        Approve
                      </button>
                    )}
                    {can('hrms.payroll.post') && ['draft', 'approved'].includes(run.status) && (
                      <button onClick={() => postPayrollRun.mutate(run.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                        Post
                      </button>
                    )}
                    {can('hrms.payroll.post') && ['posted', 'paid'].includes(run.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setReversingPayrollRun(run);
                          setReversalReason('');
                        }}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Reverse
                      </button>
                    )}
                  </div>
                </div>
                {can('hrms.payroll.post') && run.status === 'posted' && (
                  <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[180px_1fr_auto]">
                    <select value={getSettlementForm(run.id).payment_method} onChange={(e) => updateSettlementForm(run.id, { payment_method: e.target.value as 'cash' | 'bank_transfer' | 'cheque' })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                    </select>
                    <input placeholder="Payment reference" value={getSettlementForm(run.id).payment_reference} onChange={(e) => updateSettlementForm(run.id, { payment_reference: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <button
                      onClick={() => settlePayrollRun.mutate({ payrollRunId: run.id, ...getSettlementForm(run.id) })}
                      className="rounded-xl bg-[#1F5E3B] px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                    >
                      Settle payroll
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3 text-right">Payable</th>
                        <th className="px-4 py-3 text-right">Present</th>
                        <th className="px-4 py-3 text-right">Leave</th>
                        <th className="px-4 py-3 text-right">Absent</th>
                        <th className="px-4 py-3 text-right">Gross</th>
                        <th className="px-4 py-3 text-right">Allowances</th>
                        <th className="px-4 py-3 text-right">Overtime</th>
                        <th className="px-4 py-3 text-right">Attendance Ded.</th>
                        <th className="px-4 py-3 text-right">Other Ded.</th>
                        <th className="px-4 py-3 text-right">Deductions</th>
                        <th className="px-4 py-3 text-right">Net</th>
                        <th className="px-4 py-3 text-right">Payslip</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {run.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {line.employee_details?.full_name || 'Employee'}
                            <span className="block text-xs font-normal text-slate-500">{line.employee_details?.department || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">{line.payable_days}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{line.present_days}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{line.leave_days}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{line.absent_days}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(line.gross_pay, settings?.currency)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatMoney(line.allowances, settings?.currency)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatMoney(line.overtime_pay, settings?.currency)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatMoney(line.attendance_deduction, settings?.currency)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatMoney(line.other_deductions, settings?.currency)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatMoney(line.deductions, settings?.currency)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#1F5E3B]">{formatMoney(line.net_pay, settings?.currency)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedPayslip({ run, line })}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
            {activePayrollRuns.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No payroll runs yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'labor' && (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['Departments', laborTotals.departments, 'Payroll departments'],
              ['Employees', laborTotals.employees, 'Paid employees'],
              ['Gross Pay', formatMoney(laborTotals.grossPay, settings?.currency), 'Before deductions'],
              ['Net Pay', formatMoney(laborTotals.netPay, settings?.currency), 'Payroll liability'],
            ].map(([title, value, detail]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-2 text-2xl font-semibold text-[#1F5E3B]">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </article>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2 sm:grid-cols-[260px_auto] sm:items-end">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Payroll period
                <select
                  value={laborPeriodFilter}
                  onChange={(event) => setLaborPeriodFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
                >
                  <option value="all">All active payroll runs</option>
                  {(payrollPeriods || []).map((period) => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-500">
                {laborPayrollRuns.length} payroll run{laborPayrollRuns.length === 1 ? '' : 's'} included
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportLaborCostCsv}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => setLaborReportOpen(true)}
                className="rounded-xl bg-[#1F5E3B] px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Print / PDF
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Employees</th>
                    <th className="px-4 py-3 text-right">Runs</th>
                    <th className="px-4 py-3 text-right">Payable</th>
                    <th className="px-4 py-3 text-right">Present</th>
                    <th className="px-4 py-3 text-right">Leave</th>
                    <th className="px-4 py-3 text-right">Absent</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right">Deductions</th>
                    <th className="px-4 py-3 text-right">Net</th>
                    <th className="px-4 py-3 text-right">Avg Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departmentLaborRows.map((row) => (
                    <tr key={row.department} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.department}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.employees}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.payrollRuns}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.payableDays}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.presentDays}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.leaveDays}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.absentDays}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(row.grossPay, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(row.deductions, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1F5E3B]">{formatMoney(row.netPay, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(row.averageNetPay, settings?.currency)}</td>
                    </tr>
                  ))}
                  {!departmentLaborRows.length && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">No payroll lines match the selected period.</td>
                    </tr>
                  )}
                </tbody>
                {departmentLaborRows.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{laborTotals.employees}</td>
                      <td className="px-4 py-3 text-right">{laborPayrollRuns.length}</td>
                      <td className="px-4 py-3 text-right">{laborTotals.payableDays}</td>
                      <td className="px-4 py-3 text-right">{laborTotals.presentDays}</td>
                      <td className="px-4 py-3 text-right">{laborTotals.leaveDays}</td>
                      <td className="px-4 py-3 text-right">{laborTotals.absentDays}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(laborTotals.grossPay, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(laborTotals.deductions, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(laborTotals.netPay, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(laborTotals.employees ? laborTotals.netPay / laborTotals.employees : 0, settings?.currency)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </section>
      )}

      {isEmployeeModalOpen && (
        <ActionModal title="Add employee" onClose={() => setIsEmployeeModalOpen(false)} maxWidthClassName="max-w-5xl">
        <form onSubmit={handleEmployeeSubmit}>
          <div className="grid gap-3 md:grid-cols-3">
            <input placeholder="Employee ID" value={employeeForm.employee_id} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_id: e.target.value.toUpperCase().replace(/\s+/g, '-') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="First name" value={employeeForm.first_name} onChange={(e) => setEmployeeForm({ ...employeeForm, first_name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="Last name" value={employeeForm.last_name} onChange={(e) => setEmployeeForm({ ...employeeForm, last_name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="Department" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="Designation" value={employeeForm.designation} onChange={(e) => setEmployeeForm({ ...employeeForm, designation: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <select value={employeeForm.employment_type} onChange={(e) => setEmployeeForm({ ...employeeForm, employment_type: e.target.value as Employee['employment_type'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
            <input type="date" value={employeeForm.hire_date} onChange={(e) => setEmployeeForm({ ...employeeForm, hire_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input type="number" step="0.01" placeholder="Salary" value={employeeForm.salary} onChange={(e) => setEmployeeForm({ ...employeeForm, salary: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={employeeForm.status} onChange={(e) => setEmployeeForm({ ...employeeForm, status: e.target.value as Employee['status'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </select>
            <input type="email" placeholder="Email" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Phone" value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Emergency contact" value={employeeForm.emergency_contact_name} onChange={(e) => setEmployeeForm({ ...employeeForm, emergency_contact_name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Emergency phone" value={employeeForm.emergency_contact_phone} onChange={(e) => setEmployeeForm({ ...employeeForm, emergency_contact_phone: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <textarea placeholder="Address" value={employeeForm.address} onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
            <textarea placeholder="Notes" value={employeeForm.notes} onChange={(e) => setEmployeeForm({ ...employeeForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-3" />
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsEmployeeModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={createEmployee.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              Save employee
            </button>
          </div>
          {createEmployee.isError && <p className="mt-3 text-sm text-red-600">Could not create employee. Check Employee ID uniqueness and required fields.</p>}
        </form>
        </ActionModal>
      )}

      {selectedPayslip && (
        <ActionModal title="Payslip" onClose={() => setSelectedPayslip(null)} maxWidthClassName="max-w-3xl">
          <PayslipView run={selectedPayslip.run} line={selectedPayslip.line} currency={settings?.currency} hotelName={settings?.name || 'Hotel'} />
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
            <button type="button" onClick={() => setSelectedPayslip(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print / Save PDF
            </button>
          </div>
        </ActionModal>
      )}

      {selectedPayslipRun && (
        <ActionModal title="Payroll payslips" onClose={() => setSelectedPayslipRun(null)} maxWidthClassName="max-w-4xl">
          <div className="receipt-print grid gap-6">
            {selectedPayslipRun.lines.map((line, index) => (
              <div key={line.id} style={{ breakAfter: index === selectedPayslipRun.lines.length - 1 ? 'auto' : 'page' }}>
                <PayslipView run={selectedPayslipRun} line={line} currency={settings?.currency} hotelName={settings?.name || 'Hotel'} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
            <button type="button" onClick={() => setSelectedPayslipRun(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print / Save PDF
            </button>
          </div>
        </ActionModal>
      )}

      {reversingPayrollRun && (
        <ActionModal
          title={`Reverse ${reversingPayrollRun.period_details?.name || 'payroll run'}`}
          description="This creates reversing journal entries and marks the payroll run as reversed."
          onClose={() => setReversingPayrollRun(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              reversePayrollRun.mutate(
                { payrollRunId: reversingPayrollRun.id, reason: reversalReason },
                {
                  onSuccess: () => {
                    setReversingPayrollRun(null);
                    setReversalReason('');
                  },
                },
              );
            }}
          >
            <div className="grid gap-3">
              <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                Net payroll {formatMoney(reversingPayrollRun.total_net_pay, settings?.currency)} will be reversed from accounting. Original journal entries remain visible for audit.
              </div>
              <textarea
                placeholder="Reversal reason"
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
                className="min-h-28 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setReversingPayrollRun(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={reversePayrollRun.isPending} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                Reverse payroll
              </button>
            </div>
            {reversePayrollRun.isError && <p className="mt-3 text-sm text-red-600">Could not reverse this payroll run.</p>}
          </form>
        </ActionModal>
      )}

      {attendanceExceptionReportOpen && (
        <ActionModal title="Attendance exception report" onClose={() => setAttendanceExceptionReportOpen(false)} maxWidthClassName="max-w-5xl">
          <AttendanceExceptionReport
            hotelName={settings?.name || 'Hotel'}
            rows={attendanceExceptionRows}
            dateFrom={attendanceDateFrom}
            dateTo={attendanceDateTo}
            generatedAt={new Date().toLocaleString()}
          />
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
            <button type="button" onClick={() => setAttendanceExceptionReportOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print / Save PDF
            </button>
          </div>
        </ActionModal>
      )}

      {laborReportOpen && (
        <ActionModal title="Department labor cost report" onClose={() => setLaborReportOpen(false)} maxWidthClassName="max-w-5xl">
          <DepartmentLaborReport
            hotelName={settings?.name || 'Hotel'}
            rows={departmentLaborRows}
            totals={laborTotals}
            periodName={laborPeriodFilter === 'all' ? 'All active payroll runs' : payrollPeriods?.find((period) => period.id === laborPeriodFilter)?.name || 'Selected period'}
            generatedAt={new Date().toLocaleString()}
            currency={settings?.currency}
          />
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
            <button type="button" onClick={() => setLaborReportOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print / Save PDF
            </button>
          </div>
        </ActionModal>
      )}
    </div>
  );
};

const PayslipView = ({
  run,
  line,
  currency,
  hotelName,
}: {
  run: PayrollRun;
  line: PayrollLine;
  currency?: string;
  hotelName: string;
}) => {
  const employee = line.employee_details;
  return (
    <div className="receipt-print rounded-2xl border border-slate-200 p-5 text-sm text-slate-800">
      <div className="print-header border-b border-slate-200 pb-3 text-center">
        <h2 className="text-xl font-bold text-slate-900">{hotelName}</h2>
        <p className="mt-1 text-xs font-semibold uppercase text-slate-600">Employee Payslip</p>
        <p className="mt-1 text-xs text-slate-500">
          {run.period_details?.name || 'Payroll period'} | {run.period_details?.start_date || '-'} to {run.period_details?.end_date || '-'}
        </p>
      </div>

      <div className="print-metrics mt-4 grid gap-2 md:grid-cols-3">
        <SlipMetric label="Employee" value={employee?.full_name || 'Employee'} />
        <SlipMetric label="Employee ID" value={employee?.employee_id || '-'} />
        <SlipMetric label="Department" value={employee?.department || '-'} />
        <SlipMetric label="Designation" value={employee?.designation || '-'} />
        <SlipMetric label="Run Status" value={run.status} />
        <SlipMetric label="Payment" value={run.payment_method ? run.payment_method.replace('_', ' ') : '-'} />
      </div>

      <div className="print-section mt-4 grid gap-4 md:grid-cols-2">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr><th className="py-2 pr-3">Earnings</th><th className="py-2 pr-3 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <PayslipAmountRow label="Base gross pay" value={line.gross_pay} currency={currency} />
            <PayslipAmountRow label="Allowances" value={line.allowances} currency={currency} />
            <PayslipAmountRow label="Overtime" value={line.overtime_pay} currency={currency} />
          </tbody>
        </table>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr><th className="py-2 pr-3">Deductions</th><th className="py-2 pr-3 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <PayslipAmountRow label="Attendance deduction" value={line.attendance_deduction} currency={currency} />
            <PayslipAmountRow label="Other deductions" value={line.other_deductions} currency={currency} />
            <PayslipAmountRow label="Total deductions" value={line.deductions} currency={currency} />
          </tbody>
        </table>
      </div>

      <div className="print-section mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">Payable</th>
              <th className="py-2 pr-3 text-right">Present</th>
              <th className="py-2 pr-3 text-right">Leave</th>
              <th className="py-2 pr-3 text-right">Absent</th>
              <th className="py-2 pr-3 text-right">Base Salary</th>
              <th className="py-2 pr-3 text-right">Net Pay</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-3 pr-3">{line.payable_days}</td>
              <td className="py-3 pr-3 text-right">{line.present_days}</td>
              <td className="py-3 pr-3 text-right">{line.leave_days}</td>
              <td className="py-3 pr-3 text-right">{line.absent_days}</td>
              <td className="py-3 pr-3 text-right">{formatMoney(line.base_salary, currency)}</td>
              <td className="print-total py-3 pr-3 text-right text-base font-bold text-slate-900">{formatMoney(line.net_pay, currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {line.notes && <p className="mt-4 text-xs text-slate-600">{line.notes}</p>}
      <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-slate-600">
        <div className="border-t border-slate-300 pt-2">Employee signature</div>
        <div className="border-t border-slate-300 pt-2 text-right">Authorized signature</div>
      </div>
    </div>
  );
};

const SlipMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs uppercase text-slate-500">{label}</p>
    <p className="mt-1 font-semibold capitalize text-slate-900">{value}</p>
  </div>
);

const PayslipAmountRow = ({ label, value, currency }: { label: string; value: string; currency?: string }) => (
  <tr>
    <td className="py-2 pr-3">{label}</td>
    <td className="py-2 pr-3 text-right font-medium text-slate-900">{formatMoney(value, currency)}</td>
  </tr>
);

const AttendanceExceptionReport = ({
  hotelName,
  rows,
  dateFrom,
  dateTo,
  generatedAt,
}: {
  hotelName: string;
  rows: AttendanceExceptionRow[];
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
}) => {
  const counts = {
    late: rows.filter((row) => row.type === 'Late').length,
    absent: rows.filter((row) => row.type === 'Absent').length,
    halfDay: rows.filter((row) => row.type === 'Half Day').length,
    missingClockOut: rows.filter((row) => row.type === 'Missing Clock-out').length,
  };

  return (
    <div className="receipt-print grid gap-4 text-sm text-slate-800">
      <div className="print-header border-b border-slate-200 pb-3 text-center">
        <h2 className="text-xl font-bold text-slate-900">{hotelName}</h2>
        <p className="mt-1 text-xs font-semibold uppercase text-slate-600">Attendance Exception Report</p>
        <p className="mt-1 text-xs text-slate-500">{dateFrom || 'All dates'} to {dateTo || 'All dates'} | Generated {generatedAt}</p>
      </div>
      <div className="print-metrics grid gap-2 md:grid-cols-5">
        <SlipMetric label="Total" value={String(rows.length)} />
        <SlipMetric label="Late" value={String(counts.late)} />
        <SlipMetric label="Absent" value={String(counts.absent)} />
        <SlipMetric label="Half Day" value={String(counts.halfDay)} />
        <SlipMetric label="Missing Out" value={String(counts.missingClockOut)} />
      </div>
      <div className="print-section overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="border-b border-slate-200 uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Employee</th>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Shift</th>
              <th className="py-2 pr-3 text-right">Clock In</th>
              <th className="py-2 pr-3 text-right">Clock Out</th>
              <th className="py-2 pr-3 text-right">Hours</th>
              <th className="py-2 pr-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={`${row.id}-${row.type}`}>
                <td className="py-2 pr-3 font-semibold">{row.type}</td>
                <td className="py-2 pr-3">{row.employee}<span className="block text-slate-500">{row.employeeId} - {row.department}</span></td>
                <td className="py-2 pr-3">{row.date}</td>
                <td className="py-2 pr-3">{row.shift}</td>
                <td className="py-2 pr-3 text-right">{formatTime(row.clockIn)}</td>
                <td className="py-2 pr-3 text-right">{formatTime(row.clockOut)}</td>
                <td className="py-2 pr-3 text-right">{row.hoursWorked}</td>
                <td className="py-2 pr-3">{row.notes || '-'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No attendance exceptions match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DepartmentLaborReport = ({
  hotelName,
  rows,
  totals,
  periodName,
  generatedAt,
  currency,
}: {
  hotelName: string;
  rows: DepartmentLaborRow[];
  totals: {
    departments: number;
    employees: number;
    payrollRuns: number;
    payableDays: number;
    presentDays: number;
    leaveDays: number;
    absentDays: number;
    grossPay: number;
    deductions: number;
    netPay: number;
  };
  periodName: string;
  generatedAt: string;
  currency?: string;
}) => (
  <div className="receipt-print grid gap-4 text-sm text-slate-800">
    <div className="print-header border-b border-slate-200 pb-3 text-center">
      <h2 className="text-xl font-bold text-slate-900">{hotelName}</h2>
      <p className="mt-1 text-xs font-semibold uppercase text-slate-600">Department Labor Cost Report</p>
      <p className="mt-1 text-xs text-slate-500">{periodName} | Generated {generatedAt}</p>
    </div>
    <div className="print-metrics grid gap-2 md:grid-cols-5">
      <SlipMetric label="Departments" value={String(totals.departments)} />
      <SlipMetric label="Employees" value={String(totals.employees)} />
      <SlipMetric label="Gross Pay" value={formatMoney(totals.grossPay, currency)} />
      <SlipMetric label="Deductions" value={formatMoney(totals.deductions, currency)} />
      <SlipMetric label="Net Pay" value={formatMoney(totals.netPay, currency)} />
    </div>
    <div className="print-section overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-xs">
        <thead className="border-b border-slate-200 uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-3">Department</th>
            <th className="py-2 pr-3 text-right">Employees</th>
            <th className="py-2 pr-3 text-right">Payable</th>
            <th className="py-2 pr-3 text-right">Present</th>
            <th className="py-2 pr-3 text-right">Leave</th>
            <th className="py-2 pr-3 text-right">Absent</th>
            <th className="py-2 pr-3 text-right">Gross</th>
            <th className="py-2 pr-3 text-right">Deductions</th>
            <th className="py-2 pr-3 text-right">Net</th>
            <th className="py-2 pr-3 text-right">Avg Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.department}>
              <td className="py-2 pr-3 font-semibold">{row.department}</td>
              <td className="py-2 pr-3 text-right">{row.employees}</td>
              <td className="py-2 pr-3 text-right">{row.payableDays}</td>
              <td className="py-2 pr-3 text-right">{row.presentDays}</td>
              <td className="py-2 pr-3 text-right">{row.leaveDays}</td>
              <td className="py-2 pr-3 text-right">{row.absentDays}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(row.grossPay, currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(row.deductions, currency)}</td>
              <td className="py-2 pr-3 text-right font-bold text-slate-900">{formatMoney(row.netPay, currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(row.averageNetPay, currency)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={10} className="py-6 text-center text-slate-500">No payroll lines match the selected period.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="border-t border-slate-200 font-bold text-slate-900">
            <tr>
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right">{totals.employees}</td>
              <td className="py-2 pr-3 text-right">{totals.payableDays}</td>
              <td className="py-2 pr-3 text-right">{totals.presentDays}</td>
              <td className="py-2 pr-3 text-right">{totals.leaveDays}</td>
              <td className="py-2 pr-3 text-right">{totals.absentDays}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(totals.grossPay, currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(totals.deductions, currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(totals.netPay, currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(totals.employees ? totals.netPay / totals.employees : 0, currency)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  </div>
);

export default HRMS;
