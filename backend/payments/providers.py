import base64
import hashlib
import hmac
import json
from decimal import Decimal, ROUND_HALF_UP
from urllib import error, request

from django.db import connection

from payments.services import PaymentIntentError, mark_payment_failed, mark_payment_processing, mark_payment_succeeded, reconcile_payment_intent, update_provider_payload


DEFAULT_PAYMENT_SETTINGS = {
    'khalti': {
        'enabled': False,
        'mode': 'sandbox',
        'base_url': 'https://dev.khalti.com/api/v2',
        'secret_key': '',
        'website_url': 'http://localhost:5173',
        'return_url': 'http://localhost:5173/payments',
    },
    'esewa': {
        'enabled': False,
        'mode': 'sandbox',
        'payment_url': 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
        'status_url': 'https://rc.esewa.com.np/api/epay/transaction/status/',
        'product_code': 'EPAYTEST',
        'secret_key': '8gBm/:&EnhH.1/q',
        'success_url': 'http://localhost:5173/payments',
        'failure_url': 'http://localhost:5173/payments',
    },
}


def get_payment_settings():
    tenant = getattr(connection, 'tenant', None)
    tenant_settings = getattr(tenant, 'payment_settings', None) if tenant else None
    configured = tenant_settings or {}
    merged = json.loads(json.dumps(DEFAULT_PAYMENT_SETTINGS))
    for provider, values in configured.items():
        if provider in merged and isinstance(values, dict):
            merged[provider].update(values)
    return merged


def _provider_settings(provider):
    config = get_payment_settings().get(provider, {})
    if not config.get('enabled'):
        raise PaymentIntentError(f'{provider} sandbox provider is not enabled for this tenant.')
    return config


def _amount_to_paisa(amount):
    return int((Decimal(str(amount)) * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def _decimal_text(amount):
    return str(Decimal(str(amount)).quantize(Decimal('0.01')))


def _post_json(url, payload, headers=None):
    body = json.dumps(payload).encode()
    req = request.Request(
        url,
        data=body,
        headers={'Content-Type': 'application/json', **(headers or {})},
        method='POST',
    )
    try:
        with request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode())
    except error.HTTPError as exc:
        detail = exc.read().decode()
        raise PaymentIntentError(f'Provider request failed: {detail}') from exc
    except error.URLError as exc:
        raise PaymentIntentError(f'Provider request failed: {exc.reason}') from exc


def initiate_khalti_payment(intent, *, customer_info=None):
    config = _provider_settings('khalti')
    if intent.provider != 'khalti':
        raise PaymentIntentError('Payment intent provider must be Khalti.')
    secret_key = config.get('secret_key')
    if not secret_key:
        raise PaymentIntentError('Khalti secret key is not configured.')

    payload = {
        'return_url': config['return_url'],
        'website_url': config['website_url'],
        'amount': _amount_to_paisa(intent.amount),
        'purchase_order_id': intent.idempotency_key,
        'purchase_order_name': intent.description or f'{intent.source_module} {intent.source_id}',
    }
    if customer_info:
        payload['customer_info'] = customer_info

    data = _post_json(
        f"{config['base_url'].rstrip('/')}/epayment/initiate/",
        payload,
        headers={'Authorization': f"Key {secret_key}"},
    )
    pidx = data.get('pidx')
    if not pidx:
        raise PaymentIntentError('Khalti did not return a payment identifier.')
    return update_provider_payload(intent, provider_reference=pidx, payload=data)


def lookup_khalti_payment(intent):
    config = _provider_settings('khalti')
    if not intent.provider_reference:
        raise PaymentIntentError('Khalti payment has no pidx to look up.')
    secret_key = config.get('secret_key')
    if not secret_key:
        raise PaymentIntentError('Khalti secret key is not configured.')

    data = _post_json(
        f"{config['base_url'].rstrip('/')}/epayment/lookup/",
        {'pidx': intent.provider_reference},
        headers={'Authorization': f"Key {secret_key}"},
    )
    status = data.get('status', '').lower()
    if status == 'completed':
        succeeded = mark_payment_succeeded(intent, provider_reference=intent.provider_reference, payload=data)
        return reconcile_payment_intent(succeeded)
    if status in ['pending', 'initiated']:
        return mark_payment_processing(intent, provider_reference=intent.provider_reference, payload=data)
    if status in ['expired', 'user canceled', 'refunded']:
        return mark_payment_failed(intent, message=f'Khalti status: {data.get("status")}', payload=data)
    raise PaymentIntentError('Unsupported Khalti lookup status.')


def _esewa_signature(values, signed_fields, secret_key):
    message = ','.join(f'{field}={values[field]}' for field in signed_fields.split(','))
    digest = hmac.new(secret_key.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def initiate_esewa_payment(intent):
    config = _provider_settings('esewa')
    if intent.provider != 'esewa':
        raise PaymentIntentError('Payment intent provider must be eSewa.')
    secret_key = config.get('secret_key')
    if not secret_key:
        raise PaymentIntentError('eSewa secret key is not configured.')

    signed_fields = 'total_amount,transaction_uuid,product_code'
    values = {
        'amount': _decimal_text(intent.amount),
        'tax_amount': '0',
        'total_amount': _decimal_text(intent.amount),
        'product_service_charge': '0',
        'product_delivery_charge': '0',
        'transaction_uuid': intent.idempotency_key,
        'product_code': config['product_code'],
        'success_url': config['success_url'],
        'failure_url': config['failure_url'],
        'signed_field_names': signed_fields,
    }
    values['signature'] = _esewa_signature(values, signed_fields, secret_key)
    payload = {'payment_url': config['payment_url'], 'form_fields': values}
    return update_provider_payload(intent, provider_reference=intent.idempotency_key, payload=payload)


def verify_esewa_callback(intent, *, encoded_data=None, payload=None):
    config = _provider_settings('esewa')
    data = payload or {}
    if encoded_data:
        try:
            data = json.loads(base64.b64decode(encoded_data).decode())
        except (ValueError, json.JSONDecodeError) as exc:
            raise PaymentIntentError('Invalid eSewa callback payload.') from exc

    signed_fields = data.get('signed_field_names', '')
    signature = data.get('signature', '')
    if not signed_fields or not signature:
        raise PaymentIntentError('eSewa callback signature is missing.')
    expected = _esewa_signature(data, signed_fields, config['secret_key'])
    if not hmac.compare_digest(signature, expected):
        raise PaymentIntentError('eSewa callback signature verification failed.')

    status = str(data.get('status', '')).lower()
    if status == 'complete':
        succeeded = mark_payment_succeeded(intent, provider_reference=data.get('transaction_code', intent.provider_reference), payload=data)
        return reconcile_payment_intent(succeeded)
    if status == 'pending':
        return mark_payment_processing(intent, provider_reference=intent.provider_reference, payload=data)
    return mark_payment_failed(intent, message=f'eSewa status: {data.get("status")}', payload=data)
