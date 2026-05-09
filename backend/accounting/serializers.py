from rest_framework import serializers

from accounting.models import Account, JournalEntry, JournalLine


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = '__all__'


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

