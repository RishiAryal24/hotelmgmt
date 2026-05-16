from decimal import Decimal

from django.http import HttpResponse
from django.db import transaction
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import IsAuthenticated
from bookings.models import Booking, Guest, GuestCommunication, GuestFolio, GuestPoints, LoyaltyProgram, Package, RatePlan, Room, RoomType
from bookings.pdf import booking_confirmation_pdf, guest_folio_pdf
from bookings.serializers import (
    BookingSerializer,
    GuestCommunicationSerializer,
    GuestFolioSerializer,
    GuestPointsSerializer,
    GuestSerializer,
    LoyaltyProgramSerializer,
    PackageSerializer,
    RatePlanSerializer,
    RoomSerializer,
    RoomTypeSerializer,
)
from bookings.services import extend_booking_stay, get_guest_history, transfer_booking_room
from users.permissions import HasActionPermission
from .tasks import send_booking_confirmation_email


class RoomTypeViewSet(viewsets.ModelViewSet):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'rooms.room.read',
        'retrieve': 'rooms.room.read',
        'create': 'rooms.room.update',
        'update': 'rooms.room.update',
        'partial_update': 'rooms.room.update',
        'destroy': 'rooms.room.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'base_rate', 'max_occupancy']


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.select_related('room_type').all()
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'rooms.room.read',
        'retrieve': 'rooms.room.read',
        'create': 'rooms.room.update',
        'update': 'rooms.room.update',
        'partial_update': 'rooms.room.update',
        'destroy': 'rooms.room.update',
        'update_status': 'rooms.room.update',
    }
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
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
    }
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    ordering_fields = ['last_name', 'first_name', 'email']

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        guest = self.get_object()
        history = get_guest_history(guest)
        return Response(
            {
                'guest': self.get_serializer(guest).data,
                'summary': history['summary'],
                'bookings': BookingSerializer(history['bookings'], many=True).data,
                'folios': GuestFolioSerializer(history['folios'], many=True).data,
            },
        )


class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'availability': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
        'cancel': 'bookings.reservation.create',
        'extend_stay': 'bookings.reservation.create',
        'transfer_room': 'bookings.reservation.create',
        'check_in': 'bookings.reservation.check_in',
        'check_out': 'bookings.reservation.check_out',
    }
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
                booking.save()

                from housekeeping.services import create_checkout_cleaning_task

                create_checkout_cleaning_task(booking)

                # Send checkout confirmation email asynchronously
                send_booking_confirmation_email.delay(booking.id, booking.guest.email)
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

    @action(detail=True, methods=['post'], url_path='extend-stay')
    def extend_stay(self, request, pk=None):
        booking = self.get_object()
        new_check_out_date = parse_date(request.data.get('check_out_date') or '')
        if not new_check_out_date:
            return Response({'check_out_date': 'Valid checkout date is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            booking, folio = extend_booking_stay(booking, new_check_out_date)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'status': 'Stay extended successfully',
                'booking': self.get_serializer(booking).data,
                'folio': GuestFolioSerializer(folio).data,
            },
        )

    @action(detail=True, methods=['post'], url_path='transfer-room')
    def transfer_room(self, request, pk=None):
        booking = self.get_object()
        room_id = request.data.get('room')
        if not room_id:
            return Response({'room': 'Target room is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_room = Room.objects.get(id=room_id)
        except Room.DoesNotExist:
            return Response({'room': 'Target room was not found.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            booking, folio = transfer_booking_room(booking, new_room)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'status': 'Room transferred successfully',
                'booking': self.get_serializer(booking).data,
                'folio': GuestFolioSerializer(folio).data,
            },
        )

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

    @action(detail=True, methods=['get'], url_path='confirmation-pdf')
    def confirmation_pdf(self, request, pk=None):
        booking = self.get_object()
        pdf = booking_confirmation_pdf(booking, tenant=getattr(request, 'tenant', None))
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="reservation-{booking.id}.pdf"'
        return response


class GuestFolioViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GuestFolio.objects.select_related('booking', 'booking__guest', 'booking__room').all()
    serializer_class = GuestFolioSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'settle': 'bookings.reservation.check_out',
    }
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

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        folio = self.get_object()
        pdf = guest_folio_pdf(folio, tenant=getattr(request, 'tenant', None))
        filename = folio.folio_number or f'folio-{folio.id}'
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}.pdf"'
        return response


class RatePlanViewSet(viewsets.ModelViewSet):
    queryset = RatePlan.objects.select_related('room_type').all()
    serializer_class = RatePlanSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['room_type', 'is_active']
    search_fields = ['name', 'room_type__name']
    ordering_fields = ['name', 'base_rate']


class PackageViewSet(viewsets.ModelViewSet):
    queryset = Package.objects.all()
    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
    }
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'total_price']


class LoyaltyProgramViewSet(viewsets.ModelViewSet):
    queryset = LoyaltyProgram.objects.all()
    serializer_class = LoyaltyProgramSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
    }


class GuestPointsViewSet(viewsets.ModelViewSet):
    queryset = GuestPoints.objects.select_related('guest', 'program').all()
    serializer_class = GuestPointsSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['program']
    search_fields = ['guest__first_name', 'guest__last_name', 'guest__email']
    ordering_fields = ['total_points', 'available_points']


class GuestCommunicationViewSet(viewsets.ModelViewSet):
    queryset = GuestCommunication.objects.select_related('guest', 'booking', 'booking__room', 'created_by').all()
    serializer_class = GuestCommunicationSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['guest', 'booking', 'channel', 'direction', 'status']
    search_fields = ['guest__first_name', 'guest__last_name', 'guest__email', 'subject', 'message']
    ordering_fields = ['occurred_at', 'created_at', 'status']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
