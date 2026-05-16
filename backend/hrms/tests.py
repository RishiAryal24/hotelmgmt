from datetime import date, time
from decimal import Decimal

from django_tenants.test.cases import TenantTestCase

from accounting.models import JournalEntry
from hrms.models import Attendance, Employee, PayrollPeriod, Shift
from hrms.services import cancel_payroll_run, approve_payroll_run, generate_payroll_run, post_payroll_run, settle_payroll_run


class EmployeeRecordTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_hrms'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-hrms.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant HRMS'
        tenant.created_by = 'test'

    def test_employee_record_can_be_created(self):
        employee = Employee.objects.create(
            employee_id='EMP-TEST-001',
            first_name='Test',
            last_name='Employee',
            email='employee@example.com',
            phone='9800000000',
            department='Front Office',
            designation='Receptionist',
            employment_type='full_time',
            status='active',
            hire_date=date(2026, 5, 13),
            salary='45000.00',
        )

        self.assertEqual(employee.full_name, 'Test Employee')
        self.assertEqual(employee.department, 'Front Office')
        self.assertEqual(employee.status, 'active')

    def test_employee_status_can_track_leave(self):
        employee = Employee.objects.create(
            employee_id='EMP-TEST-002',
            first_name='Leave',
            last_name='Employee',
            department='Housekeeping',
            designation='Room Attendant',
            hire_date=date(2026, 5, 13),
        )

        employee.status = 'on_leave'
        employee.save(update_fields=['status', 'updated_at'])

        employee.refresh_from_db()
        self.assertEqual(employee.status, 'on_leave')

    def test_shift_and_attendance_can_track_hours(self):
        employee = Employee.objects.create(
            employee_id='EMP-TEST-003',
            first_name='Attendance',
            last_name='Employee',
            department='Front Office',
            designation='Receptionist',
            hire_date=date(2026, 5, 13),
        )
        shift = Shift.objects.create(
            name='Morning',
            start_time=time(8, 0),
            end_time=time(16, 0),
            break_minutes=30,
        )
        attendance = Attendance.objects.create(
            employee=employee,
            shift=shift,
            attendance_date=date(2026, 5, 14),
        )

        attendance.mark_clock_in()
        attendance.mark_clock_out()
        attendance.refresh_from_db()

        self.assertEqual(attendance.status, 'present')
        self.assertIsNotNone(attendance.clock_in)
        self.assertIsNotNone(attendance.clock_out)

    def test_payroll_run_generates_lines_from_attendance(self):
        employee = Employee.objects.create(
            employee_id='EMP-PAY-001',
            first_name='Payroll',
            last_name='Employee',
            department='Front Office',
            designation='Receptionist',
            hire_date=date(2026, 5, 1),
            salary='31000.00',
        )
        Attendance.objects.create(employee=employee, attendance_date=date(2026, 5, 1), status='present')
        Attendance.objects.create(employee=employee, attendance_date=date(2026, 5, 2), status='half_day')
        Attendance.objects.create(employee=employee, attendance_date=date(2026, 5, 3), status='on_leave')
        period = PayrollPeriod.objects.create(name='May 2026', start_date=date(2026, 5, 1), end_date=date(2026, 5, 31))

        payroll_run = generate_payroll_run(period)
        line = payroll_run.lines.get(employee=employee)

        self.assertEqual(line.payable_days, Decimal('2.50'))
        self.assertEqual(line.present_days, Decimal('1.50'))
        self.assertEqual(line.leave_days, Decimal('1.00'))
        self.assertEqual(line.absent_days, Decimal('0.50'))
        self.assertEqual(line.attendance_deduction, Decimal('28500.00'))
        self.assertEqual(line.net_pay, Decimal('2500.00'))
        period.refresh_from_db()
        self.assertEqual(period.status, 'generated')

    def test_payroll_run_can_be_approved_posted_and_settled_to_accounting(self):
        employee = Employee.objects.create(
            employee_id='EMP-PAY-002',
            first_name='Post',
            last_name='Payroll',
            department='Finance',
            designation='Accountant',
            hire_date=date(2026, 5, 1),
            salary='31000.00',
        )
        Attendance.objects.create(employee=employee, attendance_date=date(2026, 5, 1), status='present')
        period = PayrollPeriod.objects.create(name='Payroll Posting', start_date=date(2026, 5, 1), end_date=date(2026, 5, 31))
        payroll_run = generate_payroll_run(period)

        approve_payroll_run(payroll_run)
        journal_entry = post_payroll_run(payroll_run)
        payroll_run.refresh_from_db()

        self.assertEqual(payroll_run.status, 'posted')
        self.assertEqual(payroll_run.journal_entry, journal_entry)
        self.assertTrue(JournalEntry.objects.filter(source_module='payroll_run', source_id=str(payroll_run.id)).exists())

        payment_entry = settle_payroll_run(payroll_run, payment_method='bank_transfer', payment_reference='BANK-001')
        payroll_run.refresh_from_db()

        self.assertEqual(payroll_run.status, 'paid')
        self.assertEqual(payroll_run.payment_journal_entry, payment_entry)
        self.assertEqual(payroll_run.payment_method, 'bank_transfer')
        self.assertEqual(payroll_run.payment_reference, 'BANK-001')
        self.assertTrue(JournalEntry.objects.filter(source_module='payroll_payment', source_id=str(payroll_run.id)).exists())

    def test_draft_payroll_run_can_be_canceled_removed_and_regenerated(self):
        employee = Employee.objects.create(
            employee_id='EMP-PAY-003',
            first_name='Cancel',
            last_name='Payroll',
            department='Finance',
            designation='Accountant',
            hire_date=date(2026, 5, 1),
            salary='31000.00',
        )
        Attendance.objects.create(employee=employee, attendance_date=date(2026, 5, 1), status='present')
        period = PayrollPeriod.objects.create(name='Cancelable Payroll', start_date=date(2026, 5, 1), end_date=date(2026, 5, 31))
        canceled_run = generate_payroll_run(period)

        cancel_payroll_run(canceled_run)
        period.refresh_from_db()

        self.assertFalse(period.payroll_runs.filter(id=canceled_run.id).exists())
        self.assertEqual(period.status, 'draft')

        new_run = generate_payroll_run(period)

        self.assertNotEqual(new_run.id, canceled_run.id)
        self.assertEqual(new_run.status, 'draft')
        self.assertEqual(new_run.lines.count(), 1)
