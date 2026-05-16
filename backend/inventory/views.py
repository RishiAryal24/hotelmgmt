from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from inventory.models import InventoryItem, PurchaseOrder, StockMovement, Vendor
from inventory.serializers import (
    AdjustStockSerializer,
    InventoryItemSerializer,
    PurchaseOrderPaymentSerializer,
    PurchaseOrderSerializer,
    ReceiveStockSerializer,
    StockMovementSerializer,
    VendorSerializer,
)
from inventory.services import cancel_purchase_order, pay_purchase_order, receive_inventory_stock, receive_purchase_order, submit_purchase_order
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
            movement = receive_inventory_stock(
                item=data['item'],
                vendor=data.get('vendor'),
                quantity=data['quantity'],
                unit_cost=data['unit_cost'],
                reference=data.get('reference', ''),
                notes=data.get('notes', ''),
                payment_account=data['payment_account'],
                posted_by=request.user,
            )

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


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related('vendor', 'created_by').prefetch_related('lines', 'lines__item').all()
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'inventory.stock.read',
        'retrieve': 'inventory.stock.read',
        'create': 'inventory.purchase.create',
        'update': 'inventory.purchase.create',
        'partial_update': 'inventory.purchase.create',
        'destroy': 'inventory.purchase.create',
        'submit': 'inventory.purchase.create',
        'receive': 'inventory.purchase.create',
        'cancel': 'inventory.purchase.create',
        'pay': 'inventory.purchase.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'payment_status', 'vendor']
    search_fields = ['po_number', 'vendor__name', 'reference', 'notes']
    ordering_fields = ['created_at', 'order_date', 'expected_date', 'status']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _run_action(self, handler):
        purchase_order = self.get_object()
        try:
            handler(purchase_order)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        purchase_order.refresh_from_db()
        return Response(self.get_serializer(purchase_order).data)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        return self._run_action(submit_purchase_order)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        return self._run_action(lambda purchase_order: receive_purchase_order(purchase_order, posted_by=request.user))

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        return self._run_action(cancel_purchase_order)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        serializer = PurchaseOrderPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._run_action(
            lambda purchase_order: pay_purchase_order(
                purchase_order,
                payment_method=serializer.validated_data['payment_method'],
                posted_by=request.user,
            ),
        )
