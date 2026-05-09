import React, { useMemo, useState } from 'react';
import {
  useAvailableRooms,
  useBookingAction,
  useBookings,
  useCreateBooking,
  useCreateGuest,
  useGuests,
} from '../hooks/bookings';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { Booking, Guest } from '../types/bookings';
import { useQuery } from '@tanstack/react-query';

const emptyGuest = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  id_type: '',
  id_number: '',
};

const emptyBooking = {
  room: '',
  guest: '',
  check_in_date: '',
  check_out_date: '',
  number_of_guests: 1,
  status: 'confirmed' as Booking['status'],
  special_requests: '',
};

const statusClass = {
  confirmed: 'bg-blue-100 text-blue-800',
  checked_in: 'bg-green-100 text-green-800',
  checked_out: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-red-100 text-red-800',
};

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

type CheckoutPaymentMethod = (typeof paymentMethods)[number]['value'];

const Bookings: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: bookings, isLoading, error } = useBookings();
  const { data: guests } = useGuests();
  const createGuest = useCreateGuest();
  const createBooking = useCreateBooking();
  const bookingAction = useBookingAction();
  const [activeForm, setActiveForm] = useState<'guest' | 'booking' | null>(null);
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null);
  const [checkoutPayment, setCheckoutPayment] = useState<{ payment_method: CheckoutPaymentMethod; paid_amount: string }>({
    payment_method: 'cash',
    paid_amount: '',
  });
  const [guestForm, setGuestForm] = useState<Omit<Guest, 'id'>>(emptyGuest);
  const [bookingForm, setBookingForm] = useState<Omit<Booking, 'id' | 'total_amount' | 'room_details' | 'guest_details'>>(
    emptyBooking,
  );
  const { data: availableRooms, isFetching: roomsLoading } = useAvailableRooms(
    bookingForm.check_in_date,
    bookingForm.check_out_date,
  );

  const selectedRoom = useMemo(
    () => availableRooms?.find((room) => room.id === bookingForm.room),
    [availableRooms, bookingForm.room],
  );

  const estimatedTotal = useMemo(() => {
    if (!selectedRoom || !bookingForm.check_in_date || !bookingForm.check_out_date) return 0;
    const checkIn = new Date(bookingForm.check_in_date);
    const checkOut = new Date(bookingForm.check_out_date);
    const nights = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
    return nights * Number(selectedRoom.price_per_night);
  }, [bookingForm.check_in_date, bookingForm.check_out_date, selectedRoom]);

  const handleCreateGuest = (e: React.FormEvent) => {
    e.preventDefault();
    createGuest.mutate(guestForm, {
      onSuccess: (guest) => {
        setGuestForm(emptyGuest);
        setActiveForm('booking');
        setBookingForm({ ...bookingForm, guest: guest.id });
      },
    });
  };

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    createBooking.mutate(bookingForm, {
      onSuccess: () => {
        setActiveForm(null);
        setBookingForm(emptyBooking);
      },
    });
  };

  const openCheckout = (booking: Booking) => {
    const amountDue = booking.folio_details?.grand_total || booking.total_amount;
    setCheckoutBooking(booking);
    setCheckoutPayment({ payment_method: 'cash', paid_amount: amountDue });
  };

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutBooking) return;
    bookingAction.mutate(
      {
        bookingId: checkoutBooking.id,
        action: 'check_out',
        payload: checkoutPayment,
      },
      {
        onSuccess: () => setCheckoutBooking(null),
      },
    );
  };

  if (isLoading) return <div className="p-6 text-slate-600">Loading reservations...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading reservations</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reservations</h1>
          <p className="mt-2 text-slate-600">Create guests, reserve rooms, and handle front desk status changes.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setActiveForm(activeForm === 'guest' ? null : 'guest')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {activeForm === 'guest' ? 'Cancel' : 'Add Guest'}
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'booking' ? null : 'booking')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {activeForm === 'booking' ? 'Cancel' : 'New Reservation'}
          </button>
        </div>
      </div>

      {activeForm === 'guest' && (
        <form onSubmit={handleCreateGuest} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Guest</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              placeholder="First Name"
              value={guestForm.first_name}
              onChange={(e) => setGuestForm({ ...guestForm, first_name: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              placeholder="Last Name"
              value={guestForm.last_name}
              onChange={(e) => setGuestForm({ ...guestForm, last_name: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={guestForm.email}
              onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              placeholder="Phone"
              value={guestForm.phone}
              onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <input
              placeholder="ID Type"
              value={guestForm.id_type}
              onChange={(e) => setGuestForm({ ...guestForm, id_type: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <input
              placeholder="ID Number"
              value={guestForm.id_number}
              onChange={(e) => setGuestForm({ ...guestForm, id_number: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <textarea
              placeholder="Address"
              value={guestForm.address}
              onChange={(e) => setGuestForm({ ...guestForm, address: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2"
            />
          </div>
          {createGuest.isError && <p className="mt-4 text-sm text-red-600">Could not create guest.</p>}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Guest
          </button>
        </form>
      )}

      {activeForm === 'booking' && (
        <form onSubmit={handleCreateBooking} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Reservation</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={bookingForm.guest}
              onChange={(e) => setBookingForm({ ...bookingForm, guest: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="">Select Guest</option>
              {guests?.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.first_name} {guest.last_name} - {guest.email}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Number of Guests"
              value={bookingForm.number_of_guests}
              onChange={(e) => setBookingForm({ ...bookingForm, number_of_guests: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              min="1"
              required
            />
            <input
              type="date"
              value={bookingForm.check_in_date}
              onChange={(e) => setBookingForm({ ...bookingForm, check_in_date: e.target.value, room: '' })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="date"
              value={bookingForm.check_out_date}
              onChange={(e) => setBookingForm({ ...bookingForm, check_out_date: e.target.value, room: '' })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <select
              value={bookingForm.room}
              onChange={(e) => setBookingForm({ ...bookingForm, room: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
              disabled={!bookingForm.check_in_date || !bookingForm.check_out_date}
            >
              <option value="">
                {roomsLoading
                  ? 'Checking availability...'
                  : bookingForm.check_in_date && bookingForm.check_out_date
                    ? 'Select Available Room'
                    : 'Select dates first'}
              </option>
              {availableRooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.room_number} - {room.room_type_name} - {formatMoney(room.price_per_night, settings?.currency)}
                </option>
              ))}
            </select>
            <select
              value={bookingForm.status}
              onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value as Booking['status'] })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
            </select>
            <textarea
              placeholder="Special Requests"
              value={bookingForm.special_requests}
              onChange={(e) => setBookingForm({ ...bookingForm, special_requests: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2"
            />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Estimated total: <span className="font-semibold">{formatMoney(estimatedTotal, settings?.currency)}</span>
          </div>
          {createBooking.isError && <p className="mt-4 text-sm text-red-600">Could not create reservation.</p>}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Reservation
          </button>
        </form>
      )}

      {checkoutBooking && (
        <form onSubmit={handleCheckout} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Checkout & Settlement</h2>
              <p className="mt-1 text-sm text-slate-600">
                Room {checkoutBooking.room_details?.room_number} - {checkoutBooking.guest_details?.first_name}{' '}
                {checkoutBooking.guest_details?.last_name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCheckoutBooking(null)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex justify-between gap-4 text-sm text-slate-700">
                <span>Room charges</span>
                <span className="font-medium text-slate-900">
                  {formatMoney(checkoutBooking.folio_details?.subtotal || checkoutBooking.total_amount, settings?.currency)}
                </span>
              </div>
              {(checkoutBooking.folio_details?.lines || []).map((line) => (
                <div key={line.id} className="mt-2 flex justify-between gap-4 text-sm text-slate-700">
                  <span>{line.description}</span>
                  <span className="font-medium text-slate-900">{formatMoney(line.amount, settings?.currency)}</span>
                </div>
              ))}
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex justify-between gap-4 text-base font-semibold text-slate-900">
                  <span>Total due</span>
                  <span>{formatMoney(checkoutBooking.folio_details?.grand_total || checkoutBooking.total_amount, settings?.currency)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <label className="text-sm font-medium text-slate-700">Payment Method</label>
              <select
                value={checkoutPayment.payment_method}
                onChange={(e) => setCheckoutPayment({ ...checkoutPayment, payment_method: e.target.value as CheckoutPaymentMethod })}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>

              <label className="mt-4 block text-sm font-medium text-slate-700">Amount Paid</label>
              <input
                type="number"
                step="0.01"
                value={checkoutPayment.paid_amount}
                onChange={(e) => setCheckoutPayment({ ...checkoutPayment, paid_amount: e.target.value })}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
              {bookingAction.isError && <p className="mt-3 text-sm text-red-600">Could not complete checkout settlement.</p>}
              <button
                type="submit"
                className="mt-4 w-full rounded-xl bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
              >
                Confirm Checkout
              </button>
            </div>
          </div>
        </form>
      )}

      <section className="space-y-4">
        {bookings?.map((booking) => (
          <article key={booking.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Booking #{booking.id.slice(-8)} - Room {booking.room_details?.room_number}
                </h3>
                <p className="mt-1 text-slate-600">
                  {booking.guest_details?.first_name} {booking.guest_details?.last_name} - {booking.guest_details?.email}
                </p>
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>
                    Check-in: {booking.check_in_date} | Check-out: {booking.check_out_date}
                  </p>
                  <p>
                    Guests: {booking.number_of_guests} | Total: {formatMoney(booking.total_amount, settings?.currency)}
                  </p>
                  {booking.special_requests && <p>Requests: {booking.special_requests}</p>}
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass[booking.status]}`}>
                  {booking.status}
                </span>
                <div className="flex gap-2">
                  {booking.status === 'confirmed' && (
                    <>
                      <button
                        onClick={() => bookingAction.mutate({ bookingId: booking.id, action: 'check_in' })}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Check In
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Cancel this reservation?')) {
                            bookingAction.mutate({ bookingId: booking.id, action: 'cancel' });
                          }
                        }}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {booking.status === 'checked_in' && (
                    <button
                      onClick={() => openCheckout(booking)}
                      className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Check Out
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
        {bookings?.length === 0 && <p className="text-slate-600">No reservations created yet.</p>}
      </section>
    </div>
  );
};

export default Bookings;
