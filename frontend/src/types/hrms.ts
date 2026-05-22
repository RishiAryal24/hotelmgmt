import { AuthUser } from '../services/auth';

export interface Employee {
  id: string;
  employee_id: string;
  user: string | null;
  user_details?: AuthUser | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  employment_type: 'full_time' | 'part_time' | 'contract' | 'intern';
  status: 'active' | 'on_leave' | 'inactive' | 'terminated';
  hire_date: string;
  salary: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes: number;
  is_active: boolean;
  notes: string;
}

export interface Attendance {
  id: string;
  employee: string;
  employee_details?: Employee;
  shift: string | null;
  shift_details?: Shift | null;
  attendance_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'scheduled' | 'present' | 'late' | 'absent' | 'half_day' | 'on_leave';
  notes: string;
  hours_worked: string;
}

export interface PayrollPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'generated' | 'closed';
  notes: string;
}

export interface PayrollLine {
  id: string;
  payroll_run: string;
  employee: string;
  employee_details?: Employee;
  base_salary: string;
  payable_days: string;
  present_days: string;
  leave_days: string;
  absent_days: string;
  gross_pay: string;
  allowances: string;
  overtime_pay: string;
  attendance_deduction: string;
  other_deductions: string;
  deductions: string;
  net_pay: string;
  notes: string;
}

export interface PayrollRun {
  id: string;
  period: string;
  period_details?: PayrollPeriod;
  status: 'draft' | 'approved' | 'posted' | 'paid' | 'canceled' | 'reversed';
  generated_at: string;
  approved_at: string | null;
  posted_at: string | null;
  paid_at: string | null;
  journal_entry: string | null;
  payment_journal_entry: string | null;
  journal_entry_number?: string;
  payment_journal_entry_number?: string;
  reversal_journal_entry: string | null;
  payment_reversal_journal_entry: string | null;
  reversal_journal_entry_number?: string;
  payment_reversal_journal_entry_number?: string;
  payment_method: '' | 'cash' | 'bank_transfer' | 'cheque';
  payment_reference: string;
  reversed_at: string | null;
  reversal_reason: string;
  notes: string;
  lines: PayrollLine[];
  total_gross_pay: string;
  total_deductions: string;
  total_net_pay: string;
}
