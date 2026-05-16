from rest_framework import serializers

from inventory.models import InventoryItem, PurchaseOrder, PurchaseOrderLine, StockMovement, Vendor


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'


class InventoryItemSerializer(serializers.ModelSerializer):
    current_stock = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = InventoryItem
        fields = '__all__'


class StockMovementSerializer(serializers.ModelSerializer):
    item_details = InventoryItemSerializer(source='item', read_only=True)
    vendor_details = VendorSerializer(source='vendor', read_only=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = ['occurred_at', 'created_by']


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    item_details = InventoryItemSerializer(source='item', read_only=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = '__all__'
        read_only_fields = ['purchase_order']


class PurchaseOrderSerializer(serializers.ModelSerializer):
    vendor_details = VendorSerializer(source='vendor', read_only=True)
    lines = PurchaseOrderLineSerializer(many=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = '__all__'
        read_only_fields = [
            'po_number',
            'status',
            'payment_status',
            'received_at',
            'paid_at',
            'payment_method',
            'created_by',
        ]

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        purchase_order = PurchaseOrder.objects.create(**validated_data)
        for line_data in lines_data:
            PurchaseOrderLine.objects.create(purchase_order=purchase_order, **line_data)
        return purchase_order

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError('At least one line is required.')
        return value


class PurchaseOrderPaymentSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=['cash', 'bank'], default='cash')


class ReceiveStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.filter(is_active=True))
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.filter(is_active=True), required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0.001)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    payment_account = serializers.ChoiceField(choices=['1000', '1010', '2000'], default='2000')


class AdjustStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.filter(is_active=True))
    movement_type = serializers.ChoiceField(choices=['waste', 'adjustment_in', 'adjustment_out'])
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0.001)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False)
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
