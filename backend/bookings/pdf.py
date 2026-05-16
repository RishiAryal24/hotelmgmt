from decimal import Decimal
from textwrap import wrap


def _escape_pdf_text(value):
    text = str(value or '')
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _money(value, currency=''):
    amount = Decimal(str(value or 0)).quantize(Decimal('0.01'))
    return f"{currency} {amount}" if currency else str(amount)


def build_text_pdf(title, lines):
    y = 790
    commands = ['BT', '/F1 16 Tf', f'50 {y} Td', f'({_escape_pdf_text(title)}) Tj']
    y -= 28
    commands.extend(['/F1 10 Tf', f'50 {y} Td'])

    for raw_line in lines:
        wrapped_lines = wrap(str(raw_line or ''), width=88) or ['']
        for line in wrapped_lines:
            commands.append(f'({_escape_pdf_text(line)}) Tj')
            commands.append('0 -14 Td')
            y -= 14
            if y < 60:
                commands.append('(Continued on next page is not available for this simple export.) Tj')
                break
        if y < 60:
            break

    commands.append('ET')
    stream = '\n'.join(commands).encode('latin-1', errors='replace')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode('ascii') + b' >>\nstream\n' + stream + b'\nendstream',
    ]

    pdf = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f'{index} 0 obj\n'.encode('ascii'))
        pdf.extend(obj)
        pdf.extend(b'\nendobj\n')

    xref_offset = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n'.encode('ascii'))
    pdf.extend(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        pdf.extend(f'{offset:010d} 00000 n \n'.encode('ascii'))
    pdf.extend(
        f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n'.encode('ascii'),
    )
    return bytes(pdf)


def booking_confirmation_pdf(booking, tenant=None):
    currency = getattr(tenant, 'currency', '')
    tenant_name = getattr(tenant, 'name', 'Hotel')
    guest = booking.guest
    room = booking.room
    lines = [
        tenant_name,
        '',
        f'Confirmation: {booking.id}',
        f'Guest: {guest.first_name} {guest.last_name}',
        f'Email: {guest.email}',
        f'Phone: {guest.phone or "-"}',
        '',
        f'Room: {room.room_number} - {room.room_type.name}',
        f'Check-in: {booking.check_in_date}',
        f'Check-out: {booking.check_out_date}',
        f'Guests: {booking.number_of_guests}',
        f'Status: {booking.status.replace("_", " ")}',
        f'Total: {_money(booking.total_amount, currency)}',
        '',
        f'Special requests: {booking.special_requests or "-"}',
    ]
    return build_text_pdf('Reservation Confirmation', lines)


def guest_folio_pdf(folio, tenant=None):
    currency = getattr(tenant, 'currency', '')
    tenant_name = getattr(tenant, 'name', 'Hotel')
    booking = folio.booking
    lines = [
        tenant_name,
        '',
        f'Folio: {folio.folio_number}',
        f'Guest: {booking.guest.first_name} {booking.guest.last_name}',
        f'Room: {booking.room.room_number}',
        f'Stay: {booking.check_in_date} to {booking.check_out_date}',
        f'Status: {folio.status}',
        '',
        'Charges:',
        f'Room subtotal: {_money(folio.subtotal, currency)}',
        f'Tax: {_money(folio.tax_total, currency)}',
        f'Service charge: {_money(folio.service_charge_total, currency)}',
    ]
    for line in folio.lines.all():
        lines.append(f'{line.description}: {_money(line.amount, currency)}')
    lines.extend(
        [
            '',
            f'Grand total: {_money(folio.grand_total, currency)}',
            f'Paid amount: {_money(folio.paid_amount, currency)}',
            f'Payment method: {folio.payment_method or "-"}',
        ],
    )
    return build_text_pdf('Guest Folio', lines)
