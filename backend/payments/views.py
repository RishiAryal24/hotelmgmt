from django.db.models import Count, Sum
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from payments.models import PaymentIntent
from payments.providers import initiate_esewa_payment, initiate_khalti_payment, lookup_khalti_payment, verify_esewa_callback
from payments.serializers import EsewaVerifySerializer, PaymentFollowUpSerializer, PaymentInitiateSerializer, PaymentIntentActionSerializer, PaymentIntentCreateSerializer, PaymentIntentSerializer, PaymentProviderCallbackSerializer
from payments.services import PaymentIntentError, cancel_payment_intent, handle_provider_callback, mark_payment_failed, mark_payment_processing, mark_payment_succeeded, reconcile_payment_intent
from users.permissions import HasActionPermission


class PaymentIntentViewSet(viewsets.ModelViewSet):
    queryset = PaymentIntent.objects.select_related('created_by').all()
    serializer_class = PaymentIntentSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'payments.intent.read',
        'retrieve': 'payments.intent.read',
        'create': 'payments.intent.create',
        'processing': 'payments.intent.update',
        'succeed': 'payments.intent.update',
        'fail': 'payments.intent.update',
        'cancel': 'payments.intent.update',
        'initiate_khalti': 'payments.intent.update',
        'lookup_khalti': 'payments.intent.update',
        'initiate_esewa': 'payments.intent.update',
        'verify_esewa': 'payments.intent.update',
        'reconcile': 'payments.intent.update',
        'follow_up': 'payments.intent.update',
        'summary': 'payments.intent.read',
        'export': 'payments.intent.read',
        'provider_callback': 'payments.intent.callback',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['source_module', 'source_id', 'provider', 'status', 'settlement_status', 'follow_up_status', 'currency']
    search_fields = ['source_id', 'provider_reference', 'idempotency_key', 'description']
    ordering_fields = ['created_at', 'updated_at', 'amount', 'status', 'provider']

    def get_serializer_class(self):
        if self.action == 'create':
            return PaymentIntentCreateSerializer
        if self.action in ['processing', 'succeed', 'fail', 'cancel']:
            return PaymentIntentActionSerializer
        if self.action in ['initiate_khalti', 'initiate_esewa']:
            return PaymentInitiateSerializer
        if self.action == 'verify_esewa':
            return EsewaVerifySerializer
        if self.action == 'follow_up':
            return PaymentFollowUpSerializer
        if self.action == 'provider_callback':
            return PaymentProviderCallbackSerializer
        return PaymentIntentSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        intent = serializer.save()
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    def _action_response(self, handler):
        serializer = self.get_serializer(data=self.request.data)
        serializer.is_valid(raise_exception=True)
        intent = self.get_object()
        try:
            intent = handler(intent, serializer.validated_data)
        except PaymentIntentError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def processing(self, request, pk=None):
        return self._action_response(lambda intent, data: mark_payment_processing(intent, provider_reference=data.get('provider_reference', ''), payload=data.get('payload')))

    @action(detail=True, methods=['post'])
    def succeed(self, request, pk=None):
        return self._action_response(lambda intent, data: mark_payment_succeeded(intent, provider_reference=data.get('provider_reference', ''), payload=data.get('payload')))

    @action(detail=True, methods=['post'])
    def fail(self, request, pk=None):
        return self._action_response(lambda intent, data: mark_payment_failed(intent, message=data.get('message', ''), payload=data.get('payload')))

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        return self._action_response(lambda intent, data: cancel_payment_intent(intent, message=data.get('message') or 'Canceled by user'))

    @action(detail=True, methods=['post'], url_path='initiate-khalti')
    def initiate_khalti(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        intent = self.get_object()
        try:
            intent = initiate_khalti_payment(intent, customer_info=serializer.validated_data.get('customer_info'))
        except PaymentIntentError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='lookup-khalti')
    def lookup_khalti(self, request, pk=None):
        intent = self.get_object()
        try:
            intent = lookup_khalti_payment(intent)
        except PaymentIntentError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='initiate-esewa')
    def initiate_esewa(self, request, pk=None):
        intent = self.get_object()
        try:
            intent = initiate_esewa_payment(intent)
        except PaymentIntentError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='verify-esewa')
    def verify_esewa(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        intent = self.get_object()
        try:
            intent = verify_esewa_callback(
                intent,
                encoded_data=serializer.validated_data.get('encoded_data'),
                payload=serializer.validated_data.get('payload'),
            )
        except PaymentIntentError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        intent = self.get_object()
        try:
            intent = reconcile_payment_intent(intent, posted_by=request.user)
        except PaymentIntentError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='follow-up')
    def follow_up(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        intent = self.get_object()
        intent.update_follow_up(
            status=serializer.validated_data['status'],
            notes=serializer.validated_data.get('notes', ''),
            user=request.user,
        )
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        totals = queryset.aggregate(count=Count('id'), amount=Sum('amount'))
        by_provider = list(queryset.values('provider').annotate(count=Count('id'), amount=Sum('amount')).order_by('provider'))
        by_status = list(queryset.values('status').annotate(count=Count('id'), amount=Sum('amount')).order_by('status'))
        by_settlement = list(queryset.values('settlement_status').annotate(count=Count('id'), amount=Sum('amount')).order_by('settlement_status'))
        by_follow_up = list(queryset.values('follow_up_status').annotate(count=Count('id'), amount=Sum('amount')).order_by('follow_up_status'))
        attention = queryset.filter(settlement_status__in=['failed', 'skipped']).exclude(follow_up_status='resolved').count()
        return Response(
            {
                'count': totals['count'] or 0,
                'amount': totals['amount'] or 0,
                'attention_count': attention,
                'by_provider': by_provider,
                'by_status': by_status,
                'by_settlement': by_settlement,
                'by_follow_up': by_follow_up,
            }
        )

    @action(detail=False, methods=['get'])
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset()).order_by('-created_at')
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="payment-intents.csv"'
        response.write('source,source_id,provider,provider_reference,amount,currency,status,settlement_status,follow_up_status,created_at,settled_at,description\n')
        for intent in queryset:
            values = [
                intent.source_module,
                intent.source_id,
                intent.provider,
                intent.provider_reference,
                intent.amount,
                intent.currency,
                intent.status,
                intent.settlement_status,
                intent.follow_up_status,
                intent.created_at.isoformat() if intent.created_at else '',
                intent.settled_at.isoformat() if intent.settled_at else '',
                intent.description,
            ]
            row = ','.join(f'"{str(value).replace(chr(34), chr(34) + chr(34))}"' for value in values)
            response.write(f'{row}\n')
        return response

    @action(detail=False, methods=['post'], url_path='provider-callback')
    def provider_callback(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            intent = handle_provider_callback(**serializer.validated_data)
        except PaymentIntentError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentIntentSerializer(intent, context=self.get_serializer_context()).data)
