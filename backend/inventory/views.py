from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from inventory.models import InventoryItem, StockMovement, Vendor
from inventory.serializers import (
    AdjustStockSerializer,
    InventoryItemSerializer,
    ReceiveStockSerializer,
    StockMovementSerializer,
    VendorSerializer,
)
from users.permissions import HasActionPermission


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'inventory.stock.read',
        'retrieve': 'inventory.stock.read',
        'create': 'inventory.purchase.create',
        'update': 'inventory.purchase.create',
        'partial_update': 'inventory.purchase.create',
        'destroy': 'inventory.purchase.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'email', 'phone', 'tax_number']
    ordering_fields = ['name', 'created_at']


class InventoryItemViewSet(viewsets.ModelViewSet):
    queryset = InventoryItem.objects.all()
    serializer_class = InventoryItemSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'inventory.stock.read',
        'retrieve': 'inventory.stock.read',
        'low_stock': 'inventory.stock.read',
        'create': 'inventory.purchase.create',
        'update': 'inventory.purchase.create',
        'partial_update': 'inventory.purchase.create',
        'destroy': 'inventory.purchase.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'unit', 'is_active']
    search_fields = ['sku', 'name', 'category']
    ordering_fields = ['name', 'sku', 'cost_price', 'reorder_level']

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        items = [item for item in self.filter_queryset(self.get_queryset()) if item.is_low_stock]
        return Response(InventoryItemSerializer(items, many=True).data)


class StockMovementViewSet(viewsets.ModelViewSet):
    queryset = StockMovement.objects.select_related('item', 'vendor', 'created_by').all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'inventory.stock.read',
        'retrieve': 'inventory.stock.read',
        'create': 'inventory.purchase.create',
        'update': 'inventory.purchase.create',
        'partial_update': 'inventory.purchase.create',
        'destroy': 'inventory.purchase.create',
        'receive': 'inventory.purchase.create',
        'adjust': 'inventory.purchase.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['movement_type', 'item', 'vendor', 'source_module']
    search_fields = ['item__sku', 'item__name', 'vendor__name', 'reference', 'notes']
    ordering_fields = ['occurred_at', 'created_at', 'quantity', 'unit_cost']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'])
    def receive(self, request):
        serializer = ReceiveStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            movement = StockMovement.objects.create(
                item=data['item'],
                vendor=data.get('vendor'),
                movement_type='purchase',
                quantity=data['quantity'],
                unit_cost=data['unit_cost'],
                reference=data.get('reference', ''),
                notes=data.get('notes', ''),
                source_module='inventory_purchase',
                created_by=request.user,
            )
            data['item'].cost_price = data['unit_cost']
            data['item'].save(update_fields=['cost_price', 'updated_at'])

            from accounting.services import post_inventory_purchase

            post_inventory_purchase(movement, payment_account=data['payment_account'], posted_by=request.user)

        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def adjust(self, request):
        serializer = AdjustStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        unit_cost = data.get('unit_cost')
        if unit_cost is None:
            unit_cost = data['item'].cost_price

        movement = StockMovement.objects.create(
            item=data['item'],
            movement_type=data['movement_type'],
            quantity=data['quantity'],
            unit_cost=unit_cost,
            reference=data.get('reference', ''),
            notes=data.get('notes', ''),
            source_module='inventory_adjustment',
            created_by=request.user,
        )
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)
