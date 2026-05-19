from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated

from restaurant.models import KitchenTicket, KitchenTicketLine, MenuCategory, MenuItem, MenuModifier, MenuModifierGroup, MenuRecipeIngredient, RestaurantOrder, RestaurantOrderApproval, RestaurantOrderLine, RestaurantChargeConfig, RestaurantTable
from restaurant.models import CashierCounter, CashierShift
from restaurant.serializers import (
    ApplyOrderDiscountSerializer,
    CashierCounterSerializer,
    CashierShiftCloseSerializer,
    CashierShiftOpenSerializer,
    CashierShiftSerializer,
    KitchenTicketSerializer,
    MenuCategorySerializer,
    MenuItemSerializer,
    MergeOrderSerializer,
    MenuModifierGroupSerializer,
    MenuModifierSerializer,
    MenuRecipeIngredientSerializer,
    RestaurantOrderLineSerializer,
    RestaurantOrderApprovalDecisionSerializer,
    RestaurantOrderApprovalRequestSerializer,
    RestaurantOrderApprovalSerializer,
    RestaurantOrderSerializer,
    RestaurantChargeConfigSerializer,
    RestaurantTableSerializer,
    SplitBillSerializer,
    TransferTableSerializer,
    VoidOrderLineSerializer,
)
from restaurant.services import (
    RestaurantOrderActionError,
    RestaurantSettlementError,
    CashierShiftError,
    apply_order_discount,
    approve_order_approval,
    close_cashier_shift,
    get_open_cashier_shift,
    merge_order_table,
    open_cashier_shift,
    reject_order_approval,
    request_order_approval,
    settle_restaurant_order,
    split_order_bill,
    transfer_order_table,
    void_order_line,
)
from users.permissions import HasActionPermission


class MenuCategoryViewSet(viewsets.ModelViewSet):
    queryset = MenuCategory.objects.all()
    serializer_class = MenuCategorySerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'create': 'restaurant.order.update',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['display_order', 'name']


class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.select_related('category', 'inventory_item').prefetch_related('modifier_groups', 'modifier_groups__modifiers', 'recipe_ingredients', 'recipe_ingredients__item').all()
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'create': 'restaurant.order.update',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'preparation_station', 'is_available', 'is_active']
    search_fields = ['name', 'sku', 'description']
    ordering_fields = ['name', 'price', 'preparation_time_minutes']


class MenuModifierGroupViewSet(viewsets.ModelViewSet):
    queryset = MenuModifierGroup.objects.prefetch_related('modifiers', 'menu_items').all()
    serializer_class = MenuModifierGroupSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'create': 'restaurant.order.update',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['selection_type', 'is_required', 'is_active', 'menu_items']
    search_fields = ['name', 'code']
    ordering_fields = ['display_order', 'name']


class MenuModifierViewSet(viewsets.ModelViewSet):
    queryset = MenuModifier.objects.select_related('group').all()
    serializer_class = MenuModifierSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'create': 'restaurant.order.update',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['group', 'is_active']
    search_fields = ['name', 'code', 'group__name']
    ordering_fields = ['group__display_order', 'display_order', 'name', 'price_delta']


class MenuRecipeIngredientViewSet(viewsets.ModelViewSet):
    queryset = MenuRecipeIngredient.objects.select_related('menu_item', 'item').all()
    serializer_class = MenuRecipeIngredientSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'inventory.stock.read'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'inventory.stock.read'],
        'create': 'restaurant.order.update',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['menu_item', 'item']
    search_fields = ['menu_item__name', 'item__name', 'item__sku', 'notes']
    ordering_fields = ['menu_item__name', 'item__name', 'quantity']


class RestaurantTableViewSet(viewsets.ModelViewSet):
    queryset = RestaurantTable.objects.all()
    serializer_class = RestaurantTableSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'create': 'restaurant.order.update',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'section', 'is_active']
    search_fields = ['table_number', 'section']
    ordering_fields = ['section', 'table_number', 'capacity']


class RestaurantChargeConfigViewSet(viewsets.ModelViewSet):
    serializer_class = RestaurantChargeConfigSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'pos.sale.create'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'pos.sale.create'],
        'create': 'restaurant.order.update',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
        'current': ['restaurant.order.create', 'restaurant.order.update', 'pos.sale.create'],
    }

    def get_queryset(self):
        RestaurantChargeConfig.get_default()
        return RestaurantChargeConfig.objects.all()

    @action(detail=False, methods=['get', 'patch'])
    def current(self, request):
        config = RestaurantChargeConfig.get_default()
        if request.method == 'PATCH':
            serializer = self.get_serializer(config, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            for order in RestaurantOrder.objects.exclude(status__in=['paid', 'cancelled']).prefetch_related('lines'):
                order.recalculate_totals()
            return Response(serializer.data)
        return Response(self.get_serializer(config).data)


class CashierShiftViewSet(viewsets.ModelViewSet):
    queryset = CashierShift.objects.select_related('cashier').all()
    serializer_class = CashierShiftSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'pos.sale.create',
        'retrieve': 'pos.sale.create',
        'create': 'pos.sale.create',
        'current': 'pos.sale.create',
        'close': 'pos.sale.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'business_date', 'cashier']
    search_fields = ['cashier__email', 'notes']
    ordering_fields = ['business_date', 'opened_at', 'closed_at', 'expected_total', 'cash_variance']

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self.request.user, 'is_tenant_admin', False) or getattr(self.request.user, 'is_platform_admin', False):
            return queryset
        return queryset.filter(cashier=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = CashierShiftOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            shift = open_cashier_shift(cashier=request.user, **serializer.validated_data)
        except CashierShiftError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CashierShiftSerializer(shift).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def current(self, request):
        shift = CashierShift.objects.filter(cashier=request.user, status='open').select_related('cashier').first()
        if not shift:
            return Response(None)
        return Response(CashierShiftSerializer(shift).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        shift = self.get_object()
        serializer = CashierShiftCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            shift = close_cashier_shift(shift, **serializer.validated_data)
        except CashierShiftError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CashierShiftSerializer(shift).data)


class CashierCounterViewSet(viewsets.ModelViewSet):
    queryset = CashierCounter.objects.all()
    serializer_class = CashierCounterSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'pos.sale.create',
        'retrieve': 'pos.sale.create',
        'create': 'pos.sale.create',
        'update': 'pos.sale.create',
        'partial_update': 'pos.sale.create',
        'destroy': 'pos.sale.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['outlet_type', 'is_active']
    search_fields = ['name', 'code', 'notes']
    ordering_fields = ['name', 'outlet_type']


class RestaurantOrderViewSet(viewsets.ModelViewSet):
    queryset = RestaurantOrder.objects.select_related('table', 'waiter').prefetch_related('lines', 'lines__menu_item', 'lines__modifiers', 'payments').all()
    serializer_class = RestaurantOrderSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'retrieve': ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update', 'pos.sale.create'],
        'create': 'restaurant.order.create',
        'update': 'restaurant.order.update',
        'partial_update': 'restaurant.order.update',
        'destroy': 'restaurant.order.update',
        'add_line': 'restaurant.order.update',
        'send_to_kitchen': 'restaurant.order.update',
        'mark_served': 'restaurant.order.update',
        'split_bill': 'restaurant.order.update',
        'transfer_table': 'restaurant.order.update',
        'merge_table': 'restaurant.order.update',
        'void_line': 'restaurant.order.approve',
        'apply_discount': 'restaurant.order.approve',
        'request_void_line': 'restaurant.order.update',
        'request_discount': 'restaurant.order.update',
        'request_complimentary': 'restaurant.order.update',
        'settle': 'pos.sale.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'order_type', 'table', 'waiter']
    search_fields = ['order_number', 'table__table_number', 'notes']
    ordering_fields = ['created_at', 'grand_total', 'status']

    def perform_create(self, serializer):
        order = serializer.save(waiter=self.request.user)
        if order.table:
            order.table.status = 'occupied'
            order.table.save(update_fields=['status', 'updated_at'])

    @action(detail=True, methods=['post'])
    def add_line(self, request, pk=None):
        order = self.get_object()
        if order.status not in ['draft', 'sent_to_kitchen']:
            return Response({'error': 'Cannot add items to this order'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = RestaurantOrderLineSerializer(data={**request.data, 'order': order.id})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(RestaurantOrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def send_to_kitchen(self, request, pk=None):
        order = self.get_object()
        ordered_lines = list(order.lines.filter(status='ordered').select_related('menu_item').prefetch_related('modifiers'))
        if not ordered_lines:
            return Response({'error': 'Add at least one new ordered item before sending to kitchen'}, status=status.HTTP_400_BAD_REQUEST)

        stations = {}
        for line in ordered_lines:
            stations.setdefault(line.menu_item.preparation_station, []).append(line)
            line.status = 'preparing'
            line.save(update_fields=['status', 'updated_at'])

        for station, lines in stations.items():
            ticket = KitchenTicket.objects.create(order=order, station=station, status='open')
            for line in lines:
                KitchenTicketLine.objects.create(ticket=ticket, order_line=line, quantity=line.quantity, status='preparing')

        order.status = 'sent_to_kitchen'
        order.save(update_fields=['status', 'updated_at'])
        return Response(RestaurantOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def mark_served(self, request, pk=None):
        order = self.get_object()
        order.status = 'served'
        order.lines.exclude(status='cancelled').update(status='served')
        order.kitchen_tickets.exclude(status='served').update(status='served')
        order.save(update_fields=['status', 'updated_at'])
        return Response(RestaurantOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def split_bill(self, request, pk=None):
        order = self.get_object()
        serializer = SplitBillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            split_order = split_order_bill(order, serializer.validated_data['lines'])
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        order.refresh_from_db()
        return Response(
            {
                'original_order': RestaurantOrderSerializer(order).data,
                'split_order': RestaurantOrderSerializer(split_order).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def transfer_table(self, request, pk=None):
        order = self.get_object()
        serializer = TransferTableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = transfer_order_table(order, serializer.validated_data['table'])
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def merge_table(self, request, pk=None):
        order = self.get_object()
        serializer = MergeOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            target_order = merge_order_table(order, serializer.validated_data['target_order'])
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderSerializer(target_order).data)

    @action(detail=True, methods=['post'])
    def void_line(self, request, pk=None):
        order = self.get_object()
        serializer = VoidOrderLineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = void_order_line(
                order,
                serializer.validated_data['line'],
                reason=serializer.validated_data.get('reason', ''),
            )
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def apply_discount(self, request, pk=None):
        order = self.get_object()
        serializer = ApplyOrderDiscountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = apply_order_discount(
                order,
                discount_amount=serializer.validated_data['discount_amount'],
                reason=serializer.validated_data.get('reason', ''),
            )
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def request_void_line(self, request, pk=None):
        order = self.get_object()
        serializer = RestaurantOrderApprovalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approval = request_order_approval(
                order,
                action_type='void_line',
                line=serializer.validated_data.get('line'),
                reason=serializer.validated_data.get('reason', ''),
                requested_by=request.user,
            )
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def request_discount(self, request, pk=None):
        order = self.get_object()
        serializer = RestaurantOrderApprovalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approval = request_order_approval(
                order,
                action_type='discount',
                discount_amount=serializer.validated_data.get('discount_amount'),
                reason=serializer.validated_data.get('reason', ''),
                requested_by=request.user,
            )
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def request_complimentary(self, request, pk=None):
        order = self.get_object()
        serializer = RestaurantOrderApprovalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approval = request_order_approval(
                order,
                action_type='complimentary',
                reason=serializer.validated_data.get('reason', ''),
                requested_by=request.user,
            )
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        order = self.get_object()
        try:
            cashier_shift = None
            if request.data.get('cashier_shift'):
                cashier_shift = get_open_cashier_shift(cashier=request.user, cashier_shift_id=request.data.get('cashier_shift'))
            settle_restaurant_order(
                order,
                payment_method=request.data.get('payment_method'),
                paid_amount=request.data.get('paid_amount') or order.grand_total,
                booking_id=request.data.get('booking'),
                posted_by=request.user,
                cashier_shift=cashier_shift,
                payments=request.data.get('payments'),
            )
        except CashierShift.DoesNotExist:
            return Response({'error': 'Select an open cashier shift for settlement'}, status=status.HTTP_400_BAD_REQUEST)
        except RestaurantSettlementError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(RestaurantOrderSerializer(order).data)


class RestaurantOrderApprovalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RestaurantOrderApproval.objects.select_related(
        'order',
        'order__table',
        'order__room_booking',
        'order__room_booking__room',
        'order__room_booking__guest',
        'line',
        'line__menu_item',
        'requested_by',
        'decided_by',
    ).prefetch_related('order__lines', 'order__lines__menu_item').all()
    serializer_class = RestaurantOrderApprovalSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['restaurant.order.update', 'restaurant.order.approve'],
        'retrieve': ['restaurant.order.update', 'restaurant.order.approve'],
        'approve': 'restaurant.order.approve',
        'reject': 'restaurant.order.approve',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'action_type', 'order']
    search_fields = ['order__order_number', 'reason', 'requested_by__email', 'decided_by__email']
    ordering_fields = ['created_at', 'decided_at', 'status', 'action_type']

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        approval = self.get_object()
        serializer = RestaurantOrderApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approval = approve_order_approval(
                approval,
                decided_by=request.user,
                decision_notes=serializer.validated_data.get('decision_notes', ''),
            )
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderApprovalSerializer(approval).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        approval = self.get_object()
        serializer = RestaurantOrderApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approval = reject_order_approval(
                approval,
                decided_by=request.user,
                decision_notes=serializer.validated_data.get('decision_notes', ''),
            )
        except RestaurantOrderActionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RestaurantOrderApprovalSerializer(approval).data)


class KitchenTicketViewSet(viewsets.ModelViewSet):
    queryset = KitchenTicket.objects.select_related('order', 'order__table').prefetch_related('lines', 'lines__order_line__menu_item').all()
    serializer_class = KitchenTicketSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'restaurant.kitchen.update',
        'retrieve': 'restaurant.kitchen.update',
        'create': 'restaurant.kitchen.update',
        'update': 'restaurant.kitchen.update',
        'partial_update': 'restaurant.kitchen.update',
        'destroy': 'restaurant.kitchen.update',
        'start': 'restaurant.kitchen.update',
        'mark_ready': 'restaurant.kitchen.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'station', 'order']
    search_fields = ['ticket_number', 'order__order_number']
    ordering_fields = ['created_at', 'status', 'station']

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        ticket = self.get_object()
        ticket.status = 'preparing'
        ticket.save(update_fields=['status', 'updated_at'])
        ticket.lines.update(status='preparing')
        ticket.order.status = 'preparing'
        ticket.order.save(update_fields=['status', 'updated_at'])
        return Response(KitchenTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def mark_ready(self, request, pk=None):
        ticket = self.get_object()
        ticket.status = 'ready'
        ticket.save(update_fields=['status', 'updated_at'])
        ticket.lines.update(status='ready')
        for line in ticket.lines.select_related('order_line'):
            line.order_line.status = 'ready'
            line.order_line.save(update_fields=['status', 'updated_at'])
        return Response(KitchenTicketSerializer(ticket).data)
