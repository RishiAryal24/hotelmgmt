from decimal import Decimal

from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from bookings.models import Room, RoomType, Guest, Booking, GuestFolio
from bookings.serializers import RoomSerializer, RoomTypeSerializer, GuestSerializer, BookingSerializer, GuestFolioSerializer


class RoomTypeViewSet(viewsets.ModelViewSet):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'base_rate', 'max_occupancy']


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.select_related('room_type').all()
    serializer_class = RoomSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'room_type']
    search_fields = ['room_number', 'room_type__name', 'room_type__code']
    ordering_fields = ['room_number', 'price_per_night']

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        room = self.get_object()
        new_status = request.data.get('status')
        if new_status in dict(Room._meta.get_field('status').choices):
            room.status = new_status
            room.save()
            return Response({'status': 'Status updated'})
        return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)


class GuestViewSet(viewsets.ModelViewSet):
    queryset = Guest.objects.all()
    serializer_class = GuestSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    ordering_fields = ['last_name', 'first_name', 'email']


class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'room', 'guest']
    search_fields = ['guest__first_name', 'guest__last_name', 'guest__email']
    ordering_fields = ['check_in_date', 'check_out_date', 'created_at']

    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        booking = self.get_object()
        if booking.status == 'confirmed':
            booking.status = 'checked_in'
            booking.room.status = 'occupied'
            booking.save()
            booking.room.save()
            return Response({'status': 'Checked in successfully'})
        return Response({'error': 'Cannot check in'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def check_out(self, request, pk=None):
        booking = self.get_object()
        if booking.status == 'checked_in':
            payment_method = request.data.get('payment_method', 'cash')
            if payment_method not in dict(GuestFolio.PAYMENT_METHOD_CHOICES):
                return Response({'error': 'Invalid payment method'}, status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                folio, _ = GuestFolio.objects.get_or_create(
                    booking=booking,
                    defaults={
                        'subtotal': booking.total_amount,
                    },
                )
                if folio.status != 'open':
                    return Response({'error': 'Only open folios can be settled at checkout'}, status=status.HTTP_400_BAD_REQUEST)

                paid_amount = Decimal(str(request.data.get('paid_amount') or folio.grand_total))
                if paid_amount != folio.grand_total:
                    return Response({'error': 'Partial hotel folio payments are not enabled yet'}, status=status.HTTP_400_BAD_REQUEST)

                folio.settle(payment_method=payment_method, paid_amount=paid_amount)
                from accounting.services import post_room_payment

                post_room_payment(folio, posted_by=request.user)

                booking.status = 'checked_out'
                booking.room.status = 'cleaning'
                booking.save()
                booking.room.save()
                from housekeeping.models import HousekeepingTask

                HousekeepingTask.objects.get_or_create(
                    room=booking.room,
                    status='open',
                    task_type='checkout_clean',
                    defaults={
                        'priority': 'normal',
                        'notes': f'Checkout cleaning for booking {booking.id}',
                    },
                )
            return Response({
                'status': 'Checked out and settled successfully',
                'folio': GuestFolioSerializer(folio).data,
            })
        return Response({'error': 'Cannot check out'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        if booking.status != 'confirmed':
            return Response({'error': 'Only confirmed reservations can be cancelled'}, status=status.HTTP_400_BAD_REQUEST)

        booking.status = 'cancelled'
        booking.save()
        return Response({'status': 'Reservation cancelled successfully'})

    @action(detail=False, methods=['get'])
    def availability(self, request):
        check_in = request.query_params.get('check_in')
        check_out = request.query_params.get('check_out')
        if not check_in or not check_out:
            return Response({'error': 'check_in and check_out dates required'}, status=400)

        # Find available rooms
        available_rooms = Room.objects.exclude(
            bookings__check_in_date__lt=check_out,
            bookings__check_out_date__gt=check_in,
            bookings__status__in=['confirmed', 'checked_in']
        ).filter(status='available')

        serializer = RoomSerializer(available_rooms, many=True)
        return Response(serializer.data)


class GuestFolioViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GuestFolio.objects.select_related('booking', 'booking__guest', 'booking__room').all()
    serializer_class = GuestFolioSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'booking']
    search_fields = ['folio_number', 'booking__guest__first_name', 'booking__guest__last_name', 'booking__room__room_number']
    ordering_fields = ['created_at', 'grand_total', 'paid_at']

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        folio = self.get_object()
        if folio.status != 'open':
            return Response({'error': 'Only open folios can be settled'}, status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get('payment_method', 'cash')
        if payment_method not in dict(GuestFolio.PAYMENT_METHOD_CHOICES):
            return Response({'error': 'Invalid payment method'}, status=status.HTTP_400_BAD_REQUEST)

        paid_amount = Decimal(str(request.data.get('paid_amount') or folio.grand_total))
        if paid_amount != folio.grand_total:
            return Response({'error': 'Partial hotel folio payments are not enabled yet'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            folio.settle(payment_method=payment_method, paid_amount=paid_amount)
            from accounting.services import post_room_payment

            post_room_payment(folio, posted_by=request.user)

        return Response(GuestFolioSerializer(folio).data)
