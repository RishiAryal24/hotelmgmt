from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import decorators, response, status, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated

from hrms.models import Attendance, Employee, PayrollPeriod, PayrollRun, Shift
from hrms.serializers import (
    AttendanceSerializer,
    EmployeeSerializer,
    PayrollPeriodSerializer,
    PayrollRunReverseSerializer,
    PayrollRunSerializer,
    ShiftSerializer,
)
from hrms.services import cancel_payroll_run, approve_payroll_run, generate_payroll_run, post_payroll_run, reverse_payroll_run, settle_payroll_run
from users.permissions import HasActionPermission


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('user').all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'hrms.employee.read',
        'retrieve': 'hrms.employee.read',
        'create': 'hrms.employee.create',
        'update': 'hrms.employee.create',
        'partial_update': 'hrms.employee.create',
        'destroy': 'hrms.employee.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['department', 'employment_type', 'status']
    search_fields = ['employee_id', 'first_name', 'last_name', 'email', 'phone', 'department', 'designation']
    ordering_fields = ['employee_id', 'first_name', 'last_name', 'department', 'hire_date', 'salary']


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'hrms.shift.read',
        'retrieve': 'hrms.shift.read',
        'create': 'hrms.shift.create',
        'update': 'hrms.shift.create',
        'partial_update': 'hrms.shift.create',
        'destroy': 'hrms.shift.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'notes']
    ordering_fields = ['name', 'start_time', 'end_time']


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.select_related('employee', 'shift').all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'hrms.attendance.read',
        'retrieve': 'hrms.attendance.read',
        'create': 'hrms.attendance.create',
        'update': 'hrms.attendance.create',
        'partial_update': 'hrms.attendance.create',
        'destroy': 'hrms.attendance.create',
        'clock_in': 'hrms.attendance.create',
        'clock_out': 'hrms.attendance.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['employee', 'shift', 'attendance_date', 'status']
    search_fields = [
        'employee__employee_id',
        'employee__first_name',
        'employee__last_name',
        'employee__department',
        'shift__name',
    ]
    ordering_fields = ['attendance_date', 'status', 'clock_in', 'clock_out']

    @decorators.action(detail=False, methods=['post'], url_path='clock-in')
    def clock_in(self, request):
        employee_id = request.data.get('employee')
        shift_id = request.data.get('shift')
        attendance_date = request.data.get('attendance_date') or timezone.localdate()

        if not employee_id:
            return response.Response({'employee': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)

        attendance, _ = Attendance.objects.get_or_create(
            employee_id=employee_id,
            attendance_date=attendance_date,
            defaults={'shift_id': shift_id or None},
        )
        if shift_id and not attendance.shift_id:
            attendance.shift_id = shift_id
            attendance.save(update_fields=['shift', 'updated_at'])
        attendance.mark_clock_in()
        return response.Response(self.get_serializer(attendance).data)

    @decorators.action(detail=True, methods=['post'], url_path='clock-out')
    def clock_out(self, request, pk=None):
        attendance = self.get_object()
        attendance.mark_clock_out()
        return response.Response(self.get_serializer(attendance).data)


class PayrollPeriodViewSet(viewsets.ModelViewSet):
    queryset = PayrollPeriod.objects.all()
    serializer_class = PayrollPeriodSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'hrms.payroll.read',
        'retrieve': 'hrms.payroll.read',
        'create': 'hrms.payroll.create',
        'update': 'hrms.payroll.create',
        'partial_update': 'hrms.payroll.create',
        'destroy': 'hrms.payroll.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'start_date', 'end_date']
    search_fields = ['name', 'notes']
    ordering_fields = ['start_date', 'end_date', 'name', 'status']


class PayrollRunViewSet(viewsets.ModelViewSet):
    queryset = (
        PayrollRun.objects.select_related('period', 'journal_entry')
        .prefetch_related('lines__employee')
        .exclude(status='canceled')
    )
    serializer_class = PayrollRunSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'hrms.payroll.read',
        'retrieve': 'hrms.payroll.read',
        'create': 'hrms.payroll.create',
        'update': 'hrms.payroll.create',
        'partial_update': 'hrms.payroll.create',
        'destroy': 'hrms.payroll.create',
        'generate': 'hrms.payroll.create',
        'cancel': 'hrms.payroll.create',
        'approve': 'hrms.payroll.approve',
        'post': 'hrms.payroll.post',
        'reverse': 'hrms.payroll.post',
        'settle': 'hrms.payroll.post',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['period', 'status']
    search_fields = ['period__name', 'notes']
    ordering_fields = ['period__start_date', 'generated_at', 'status']

    @decorators.action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        period_id = request.data.get('period')
        if not period_id:
            return response.Response({'period': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)
        period = get_object_or_404(PayrollPeriod, id=period_id)
        try:
            payroll_run = generate_payroll_run(period)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return response.Response(self.get_serializer(payroll_run).data)

    @decorators.action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        try:
            payroll_run = approve_payroll_run(self.get_object())
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return response.Response(self.get_serializer(payroll_run).data)

    @decorators.action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        try:
            cancel_payroll_run(self.get_object())
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return response.Response(status=status.HTTP_204_NO_CONTENT)

    @decorators.action(detail=True, methods=['post'], url_path='post')
    def post(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            post_payroll_run(payroll_run, posted_by=request.user)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        payroll_run.refresh_from_db()
        return response.Response(self.get_serializer(payroll_run).data)

    @decorators.action(detail=True, methods=['post'], url_path='settle')
    def settle(self, request, pk=None):
        payroll_run = self.get_object()
        payment_method = request.data.get('payment_method') or 'bank_transfer'
        payment_reference = request.data.get('payment_reference') or ''
        try:
            settle_payroll_run(
                payroll_run,
                payment_method=payment_method,
                payment_reference=payment_reference,
                posted_by=request.user,
            )
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        payroll_run.refresh_from_db()
        return response.Response(self.get_serializer(payroll_run).data)

    @decorators.action(detail=True, methods=['post'], url_path='reverse')
    def reverse(self, request, pk=None):
        payroll_run = self.get_object()
        serializer = PayrollRunReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reverse_payroll_run(
                payroll_run,
                reason=serializer.validated_data.get('reason', ''),
                posted_by=request.user,
            )
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        payroll_run.refresh_from_db()
        return response.Response(self.get_serializer(payroll_run).data)
