from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated

from restaurant.models import KitchenTicket, KitchenTicketLine, MenuCategory, MenuItem, RestaurantOrder, RestaurantOrderLine, RestaurantTable
from restaurant.serializers import (
    KitchenTicketSerializer,
    MenuCategorySerializer,
    MenuItemSerializer,
    RestaurantOrderLineSerializer,
    RestaurantOrderSerializer,
    RestaurantTableSerializer,
)
from restaurant.services import RestaurantSettlementError, settle_restaurant_order
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
    queryset = MenuItem.objects.select_related('category').all()
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


class RestaurantOrderViewSet(viewsets.ModelViewSet):
    queryset = RestaurantOrder.objects.select_related('table', 'waiter').prefetch_related('lines', 'lines__menu_item').all()
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
        if not order.lines.exists():
            return Response({'error': 'Order has no items'}, status=status.HTTP_400_BAD_REQUEST)

        stations = {}
        for line in order.lines.filter(status='ordered'):
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
    def settle(self, request, pk=None):
        order = self.get_object()
        try:
            settle_restaurant_order(
                order,
                payment_method=request.data.get('payment_method'),
                paid_amount=request.data.get('paid_amount') or order.grand_total,
                booking_id=request.data.get('booking'),
                posted_by=request.user,
            )
        except RestaurantSettlementError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(RestaurantOrderSerializer(order).data)


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
