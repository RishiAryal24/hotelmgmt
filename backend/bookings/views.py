from decimal import Decimal
from uuid import uuid4

from django.http import HttpResponse
from django.db import transaction
from django.utils.text import slugify
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import IsAuthenticated
from bookings.followups import create_booking_follow_up_reminders, create_open_folio_follow_up, create_post_stay_follow_up
from bookings.models import Booking, DynamicPricingRule, FacilityAmenity, FacilityService, Guest, GuestCommunication, GuestFolio, GuestFolioLine, GuestFollowUpReminder, GuestPoints, LoyaltyProgram, Package, RatePlan, Room, RoomType
from bookings.pdf import booking_confirmation_pdf, guest_folio_pdf
from bookings.serializers import (
    BookingSerializer,
    BookingPriceQuoteSerializer,
    DynamicPricingRuleSerializer,
    FacilityAmenitySerializer,
    FacilityServiceSerializer,
    GuestCommunicationSerializer,
    GuestFollowUpActionSerializer,
    GuestFollowUpReminderSerializer,
    GuestFolioChargeSerializer,
    GuestFolioSerializer,
    GuestPointsSerializer,
    GuestSerializer,
    LoyaltyProgramSerializer,
    PackageReportQuerySerializer,
    PackageSerializer,
    RatePlanSerializer,
    RoomSerializer,
    RoomTypeSerializer,
)
from bookings.services import CheckoutException, TRANSFER_RATE_POLICIES, calculate_booking_price, check_in_booking, check_out_booking, create_walk_in_booking, extend_booking_stay, get_checkout_readiness, get_guest_history, get_package_booking_report, modify_confirmed_booking, require_checkout_ready, transfer_booking_room
from users.permissions import HasActionPermission
from .tasks import queue_booking_confirmation_email


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
        'walk_in': 'bookings.reservation.check_in',
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
        'quote': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
        'cancel': 'bookings.reservation.create',
        'modify': 'bookings.reservation.create',
        'extend_stay': 'bookings.reservation.create',
        'transfer_room': 'bookings.reservation.create',
        'check_in': 'bookings.reservation.check_in',
        'check_out': 'bookings.reservation.check_out',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'room', 'guest']
    search_fields = ['guest__first_name', 'guest__last_name', 'guest__email']
    ordering_fields = ['check_in_date', 'check_out_date', 'created_at']

    def create(self, request, *args, **kwargs):
        if request.data.get('status') == 'checked_in':
            return self.walk_in(request)
        response = super().create(request, *args, **kwargs)
        booking = self.get_queryset().get(pk=response.data['id'])
        create_booking_follow_up_reminders(booking, created_by=request.user)
        return response

    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        booking = self.get_object()
        try:
            booking, folio = check_in_booking(booking)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'status': 'Checked in successfully',
            'booking': self.get_serializer(booking).data,
            'folio': GuestFolioSerializer(folio).data,
        })

    @action(detail=False, methods=['post'], url_path='walk-in')
    def walk_in(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            booking, folio = create_walk_in_booking(
                room=data['room'],
                guest=data['guest'],
                rate_plan=data.get('rate_plan'),
                package=data.get('package'),
                check_in_date=data['check_in_date'],
                check_out_date=data['check_out_date'],
                number_of_guests=data.get('number_of_guests', 1),
                special_requests=data.get('special_requests', ''),
            )
            create_booking_follow_up_reminders(booking, created_by=request.user)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'status': 'Walk-in checked in successfully',
                'booking': self.get_serializer(booking).data,
                'folio': GuestFolioSerializer(folio).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def check_out(self, request, pk=None):
        booking = self.get_object()
        if booking.status == 'checked_in':
            payment_method = request.data.get('payment_method', 'cash')
            if payment_method not in dict(GuestFolio.PAYMENT_METHOD_CHOICES):
                return Response({'error': 'Invalid payment method'}, status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                cashier_shift = None
                if request.data.get('cashier_shift'):
                    from restaurant.services import get_open_cashier_shift

                    try:
                        cashier_shift = get_open_cashier_shift(cashier=request.user, cashier_shift_id=request.data.get('cashier_shift'))
                    except Exception:
                        return Response({'error': 'Select an open cashier shift for settlement'}, status=status.HTTP_400_BAD_REQUEST)

                try:
                    booking, folio = check_out_booking(
                        booking,
                        payment_method=payment_method,
                        paid_amount=request.data.get('paid_amount'),
                        posted_by=request.user,
                        cashier_shift=cashier_shift,
                    )
                except CheckoutException as exc:
                    return Response({'error': str(exc), 'readiness': exc.readiness}, status=status.HTTP_400_BAD_REQUEST)
                create_post_stay_follow_up(booking, created_by=request.user)

                queue_booking_confirmation_email(booking.id, booking.guest.email)
            return Response({
                'status': 'Checked out and settled successfully',
                'folio': GuestFolioSerializer(folio).data,
            })
        return Response({'error': 'Cannot check out'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='checkout-readiness')
    def checkout_readiness(self, request, pk=None):
        return Response(get_checkout_readiness(self.get_object()))

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        if booking.status != 'confirmed':
            return Response({'error': 'Only confirmed reservations can be cancelled'}, status=status.HTTP_400_BAD_REQUEST)

        booking.status = 'cancelled'
        booking.save()
        return Response({'status': 'Reservation cancelled successfully'})

    @action(detail=True, methods=['post'])
    def modify(self, request, pk=None):
        booking = self.get_object()
        room = booking.room
        room_id = request.data.get('room')
        check_in_date = parse_date(request.data.get('check_in_date') or '') if 'check_in_date' in request.data else None
        check_out_date = parse_date(request.data.get('check_out_date') or '') if 'check_out_date' in request.data else None
        number_of_guests = request.data.get('number_of_guests')

        if 'check_in_date' in request.data and not check_in_date:
            return Response({'check_in_date': 'Valid check-in date is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'check_out_date' in request.data and not check_out_date:
            return Response({'check_out_date': 'Valid checkout date is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if room_id:
            try:
                room = Room.objects.get(id=room_id)
            except Room.DoesNotExist:
                return Response({'room': 'Target room was not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if number_of_guests is not None:
            try:
                number_of_guests = int(number_of_guests)
            except (TypeError, ValueError):
                return Response({'number_of_guests': 'Number of guests must be a whole number.'}, status=status.HTTP_400_BAD_REQUEST)
            if number_of_guests < 1:
                return Response({'number_of_guests': 'Number of guests must be at least 1.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            booking = modify_confirmed_booking(
                booking,
                room=room,
                check_in_date=check_in_date,
                check_out_date=check_out_date,
                number_of_guests=number_of_guests,
                special_requests=request.data.get('special_requests') if 'special_requests' in request.data else None,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'status': 'Reservation modified successfully',
                'booking': self.get_serializer(booking).data,
            },
        )

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
        adjustment_policy = request.data.get('adjustment_policy') or 'keep_rate'
        transfer_date = parse_date(request.data.get('transfer_date') or '') if request.data.get('transfer_date') else None
        if not room_id:
            return Response({'room': 'Target room is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if adjustment_policy not in TRANSFER_RATE_POLICIES:
            return Response({'adjustment_policy': 'Select a valid room transfer rate policy.'}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get('transfer_date') and not transfer_date:
            return Response({'transfer_date': 'Valid transfer date is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_room = Room.objects.get(id=room_id)
        except Room.DoesNotExist:
            return Response({'room': 'Target room was not found.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            booking, folio = transfer_booking_room(
                booking,
                new_room,
                adjustment_policy=adjustment_policy,
                transfer_date=transfer_date,
            )
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

    @action(detail=False, methods=['get'])
    def quote(self, request):
        serializer = BookingPriceQuoteSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return Response(
            calculate_booking_price(
                room=data['room'],
                check_in_date=data['check_in_date'],
                check_out_date=data['check_out_date'],
                rate_plan=data.get('rate_plan'),
                package=data.get('package'),
                number_of_guests=data['number_of_guests'],
            )
        )

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
        'add_charge': 'bookings.reservation.check_out',
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

        try:
            require_checkout_ready(folio.booking)
        except CheckoutException as exc:
            return Response({'error': str(exc), 'readiness': exc.readiness}, status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get('payment_method', 'cash')
        if payment_method not in dict(GuestFolio.PAYMENT_METHOD_CHOICES):
            return Response({'error': 'Invalid payment method'}, status=status.HTTP_400_BAD_REQUEST)

        paid_amount = Decimal(str(request.data.get('paid_amount') or folio.grand_total))
        if paid_amount != folio.grand_total:
            return Response({'error': 'Partial hotel folio payments are not enabled yet'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            cashier_shift = None
            if request.data.get('cashier_shift'):
                from restaurant.services import get_open_cashier_shift

                try:
                    cashier_shift = get_open_cashier_shift(cashier=request.user, cashier_shift_id=request.data.get('cashier_shift'))
                except Exception:
                    return Response({'error': 'Select an open cashier shift for settlement'}, status=status.HTTP_400_BAD_REQUEST)
            folio.settle(payment_method=payment_method, paid_amount=paid_amount, cashier_shift=cashier_shift)
            from accounting.services import post_room_payment

            post_room_payment(folio, posted_by=request.user)

        return Response(GuestFolioSerializer(folio).data)

    @action(detail=True, methods=['post'], url_path='add-charge')
    def add_charge(self, request, pk=None):
        folio = self.get_object()
        if folio.status != 'open':
            return Response({'error': 'Only open folios can receive charges'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = GuestFolioChargeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        facility_service = serializer.validated_data.get('facility_service')
        source_module = serializer.validated_data.get('source_module')
        if facility_service and not source_module:
            source_key = facility_service.amenity.code if facility_service.amenity_id else facility_service.category
            source_module = f'facility_{slugify(source_key)[:60] or "charge"}'
        charge = GuestFolioLine.objects.create(
            folio=folio,
            source_module=source_module or 'facility_charge',
            source_id=str(uuid4()),
            description=serializer.validated_data['description'],
            amount=serializer.validated_data['amount'],
        )
        folio.recalculate_totals()
        create_open_folio_follow_up(folio, created_by=request.user)
        return Response(GuestFolioSerializer(folio).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        folio = self.get_object()
        pdf = guest_folio_pdf(folio, tenant=getattr(request, 'tenant', None))
        filename = folio.folio_number or f'folio-{folio.id}'
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}.pdf"'
        return response


class FacilityAmenityViewSet(viewsets.ModelViewSet):
    queryset = FacilityAmenity.objects.all()
    serializer_class = FacilityAmenitySerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['bookings.reservation.read', 'pos.sale.create'],
        'retrieve': ['bookings.reservation.read', 'pos.sale.create'],
        'create': 'bookings.reservation.check_out',
        'update': 'bookings.reservation.check_out',
        'partial_update': 'bookings.reservation.check_out',
        'destroy': 'bookings.reservation.check_out',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'created_at']


class FacilityServiceViewSet(viewsets.ModelViewSet):
    queryset = FacilityService.objects.select_related('amenity').all()
    serializer_class = FacilityServiceSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': ['bookings.reservation.read', 'pos.sale.create'],
        'retrieve': ['bookings.reservation.read', 'pos.sale.create'],
        'create': 'bookings.reservation.check_out',
        'update': 'bookings.reservation.check_out',
        'partial_update': 'bookings.reservation.check_out',
        'destroy': 'bookings.reservation.check_out',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['amenity', 'category', 'is_active']
    search_fields = ['name', 'code', 'description', 'amenity__name', 'amenity__code']
    ordering_fields = ['amenity__name', 'category', 'name', 'default_price', 'created_at']


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


class DynamicPricingRuleViewSet(viewsets.ModelViewSet):
    queryset = DynamicPricingRule.objects.select_related('room_type', 'rate_plan').all()
    serializer_class = DynamicPricingRuleSerializer
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
    filterset_fields = ['room_type', 'rate_plan', 'adjustment_type', 'value_type', 'is_active']
    search_fields = ['name', 'room_type__name', 'rate_plan__name']
    ordering_fields = ['priority', 'valid_from', 'valid_to', 'value']


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
        'report': 'bookings.reservation.read',
    }
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'total_price']

    @action(detail=False, methods=['get'])
    def report(self, request):
        serializer = PackageReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(
            get_package_booking_report(
                date_from=serializer.validated_data.get('date_from'),
                date_to=serializer.validated_data.get('date_to'),
            )
        )


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


class GuestFollowUpReminderViewSet(viewsets.ModelViewSet):
    queryset = GuestFollowUpReminder.objects.select_related('guest', 'booking', 'booking__room', 'assigned_to', 'created_by').all()
    serializer_class = GuestFollowUpReminderSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'bookings.reservation.read',
        'retrieve': 'bookings.reservation.read',
        'create': 'bookings.reservation.create',
        'update': 'bookings.reservation.create',
        'partial_update': 'bookings.reservation.create',
        'destroy': 'bookings.reservation.create',
        'complete': 'bookings.reservation.create',
        'snooze': 'bookings.reservation.create',
        'cancel': 'bookings.reservation.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['guest', 'booking', 'reminder_type', 'status', 'priority', 'assigned_to']
    search_fields = ['guest__first_name', 'guest__last_name', 'guest__email', 'subject', 'message']
    ordering_fields = ['due_at', 'created_at', 'priority', 'status']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        serializer = GuestFollowUpActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reminder = self.get_object()
        reminder.complete(user=request.user, notes=serializer.validated_data.get('notes', ''))
        reminder.refresh_from_db()
        return Response(self.get_serializer(reminder).data)

    @action(detail=True, methods=['post'])
    def snooze(self, request, pk=None):
        serializer = GuestFollowUpActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        snoozed_until = serializer.validated_data.get('snoozed_until')
        if not snoozed_until:
            return Response({'snoozed_until': 'A snooze date/time is required.'}, status=status.HTTP_400_BAD_REQUEST)
        reminder = self.get_object()
        reminder.snooze(user=request.user, until=snoozed_until, notes=serializer.validated_data.get('notes', ''))
        reminder.refresh_from_db()
        return Response(self.get_serializer(reminder).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        serializer = GuestFollowUpActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reminder = self.get_object()
        reminder.cancel(user=request.user, notes=serializer.validated_data.get('notes', ''))
        reminder.refresh_from_db()
        return Response(self.get_serializer(reminder).data)
