from rest_framework import serializers

from accounting.models import Account, FiscalPeriod, JournalEntry, JournalLine, TaxRate, VendorBill, VendorBillLine
from inventory.serializers import VendorSerializer
from accounting.services import ensure_open_fiscal_period
from users.serializers import UserSerializer


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = '__all__'


class TaxRateSerializer(serializers.ModelSerializer):
    account_details = AccountSerializer(source='account', read_only=True)

    class Meta:
        model = TaxRate
        fields = '__all__'

    def validate_rate(self, value):
        if value < 0:
            raise serializers.ValidationError('Tax rate cannot be negative.')
        return value

    def validate_account(self, value):
        if value.account_type != 'liability':
            raise serializers.ValidationError('Tax control account must be a liability account.')
        if not value.is_active:
            raise serializers.ValidationError('Tax control account must be active.')
        return value


class VendorBillLineSerializer(serializers.ModelSerializer):
    account_details = AccountSerializer(source='account', read_only=True)
    tax_rate_details = TaxRateSerializer(source='tax_rate', read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = VendorBillLine
        fields = '__all__'
        read_only_fields = ['vendor_bill']

    def validate_account(self, value):
        if value.account_type not in ['asset', 'expense']:
            raise serializers.ValidationError('Vendor bill line account must be an asset or expense account.')
        if not value.is_active:
            raise serializers.ValidationError('Vendor bill line account must be active.')
        return value

    def validate(self, attrs):
        amount = attrs.get('amount')
        tax_amount = attrs.get('tax_amount') or 0
        tax_rate = attrs.get('tax_rate')
        if amount is not None and amount <= 0:
            raise serializers.ValidationError('Vendor bill line amount must be greater than zero.')
        if tax_amount < 0:
            raise serializers.ValidationError('Tax amount cannot be negative.')
        if tax_amount and not tax_rate:
            raise serializers.ValidationError('Tax amount requires a tax rate.')
        return attrs


class VendorBillSerializer(serializers.ModelSerializer):
    vendor_details = VendorSerializer(source='vendor', read_only=True)
    lines = VendorBillLineSerializer(many=True)
    journal_entry_number = serializers.CharField(source='journal_entry.entry_number', read_only=True)

    class Meta:
        model = VendorBill
        fields = '__all__'
        read_only_fields = [
            'bill_number',
            'status',
            'subtotal',
            'tax_total',
            'total_amount',
            'journal_entry',
            'posted_by',
            'posted_at',
        ]

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError('At least one bill line is required.')
        return value

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        bill = VendorBill.objects.create(**validated_data)
        for line_data in lines_data:
            VendorBillLine.objects.create(vendor_bill=bill, **line_data)
        bill.recalculate_totals()
        return bill


class FiscalPeriodSerializer(serializers.ModelSerializer):
    closed_by_details = UserSerializer(source='closed_by', read_only=True)

    class Meta:
        model = FiscalPeriod
        fields = '__all__'
        read_only_fields = ['closed_at', 'closed_by']

    def validate(self, attrs):
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError('Fiscal period start date must be on or before end date.')

        queryset = FiscalPeriod.objects.all()
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if start_date and end_date and queryset.filter(start_date__lte=end_date, end_date__gte=start_date).exists():
            raise serializers.ValidationError('Fiscal periods cannot overlap.')
        return attrs


class JournalLineSerializer(serializers.ModelSerializer):
    account_details = AccountSerializer(source='account', read_only=True)

    class Meta:
        model = JournalLine
        fields = '__all__'
        extra_kwargs = {
            'journal_entry': {'required': False},
        }

    def validate(self, data):
        if data.get('debit') and data.get('credit'):
            raise serializers.ValidationError('A journal line cannot have both debit and credit.')
        if not data.get('debit') and not data.get('credit'):
            raise serializers.ValidationError('A journal line must have either debit or credit.')
        return data


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True)
    total_debit = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_credit = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    fiscal_period_name = serializers.CharField(source='fiscal_period.name', read_only=True)

    class Meta:
        model = JournalEntry
        fields = '__all__'
        read_only_fields = ['total_debit', 'total_credit']

    def validate(self, attrs):
        lines = attrs.get('lines', [])
        debit_total = sum((line.get('debit') or 0) for line in lines)
        credit_total = sum((line.get('credit') or 0) for line in lines)
        if debit_total <= 0 or credit_total <= 0:
            raise serializers.ValidationError('Journal entry must include debit and credit amounts.')
        if debit_total != credit_total:
            raise serializers.ValidationError('Journal entry must be balanced.')
        entry_date = attrs.get('entry_date', getattr(self.instance, 'entry_date', None))
        status = attrs.get('status', getattr(self.instance, 'status', 'posted'))
        if entry_date and status == 'posted':
            try:
                attrs['fiscal_period'] = ensure_open_fiscal_period(entry_date)
            except ValueError as exc:
                raise serializers.ValidationError({'entry_date': str(exc)}) from exc
        return attrs

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        entry = JournalEntry.objects.create(**validated_data)
        for line_data in lines_data:
            JournalLine.objects.create(journal_entry=entry, **line_data)
        return entry

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lines_data is not None:
            instance.lines.all().delete()
            for line_data in lines_data:
                JournalLine.objects.create(journal_entry=instance, **line_data)
        return instance


class AccountingDateRangeSerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    as_of = serializers.DateField(required=False)

    def validate(self, attrs):
        date_from = attrs.get('date_from')
        date_to = attrs.get('date_to')
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError('date_from must be on or before date_to.')
        return attrs
