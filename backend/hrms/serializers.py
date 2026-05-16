from rest_framework import serializers

from hrms.models import Attendance, Employee, PayrollLine, PayrollPeriod, PayrollRun, Shift
from users.serializers import UserSerializer


class EmployeeSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Employee
        fields = '__all__'


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = '__all__'


class AttendanceSerializer(serializers.ModelSerializer):
    employee_details = EmployeeSerializer(source='employee', read_only=True)
    shift_details = ShiftSerializer(source='shift', read_only=True)
    hours_worked = serializers.CharField(read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'


class PayrollPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollPeriod
        fields = '__all__'


class PayrollLineSerializer(serializers.ModelSerializer):
    employee_details = EmployeeSerializer(source='employee', read_only=True)

    class Meta:
        model = PayrollLine
        fields = '__all__'


class PayrollRunSerializer(serializers.ModelSerializer):
    period_details = PayrollPeriodSerializer(source='period', read_only=True)
    lines = PayrollLineSerializer(many=True, read_only=True)
    total_gross_pay = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_deductions = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_net_pay = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    journal_entry_number = serializers.CharField(source='journal_entry.entry_number', read_only=True)
    payment_journal_entry_number = serializers.CharField(source='payment_journal_entry.entry_number', read_only=True)

    class Meta:
        model = PayrollRun
        fields = '__all__'
