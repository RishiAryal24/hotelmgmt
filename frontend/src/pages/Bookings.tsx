import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CompactTabs from '../components/CompactTabs';
import {
  useAvailableRooms,
  useBookingAction,
  useBookings,
  useCreateBooking,
  useCreateGuest,
  useGuestFolios,
  useGuests,
} from '../hooks/bookings';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { Booking, Guest, GuestFolio } from '../types/bookings';

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

const statusClass: Record<Booking['status'] | GuestFolio['status'], string> = {
  confirmed: 'bg-blue-50 text-blue-700',
  checked_in: 'bg-emerald-50 text-emerald-700',
  checked_out: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-rose-50 text-rose-700',
  no_show: 'bg-rose-50 text-rose-700',
  open: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
  void: 'bg-slate-100 text-slate-700',
};

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

type CheckoutPaymentMethod = (typeof paymentMethods)[number]['value'];
type BookingTab = 'reservations' | 'guests' | 'availability' | 'folios' | 'new';

const Bookings: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: bookings, isLoading, error } = useBookings();
  const { data: guests } = useGuests();
  const { data: folios } = useGuestFolios();
  const createGuest = useCreateGuest();
  const createBooking = useCreateBooking();
  const bookingAction = useBookingAction();
  const [activeTab, setActiveTab] = useState<BookingTab>('reservations');
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null);
  const [checkoutPayment, setCheckoutPayment] = useState<{ payment_method: CheckoutPaymentMethod; paid_amount: string }>({
    payment_method: 'cash',
    paid_amount: '',
  });
  const [guestForm, setGuestForm] = useState<Omit<Guest, 'id'>>(emptyGuest);
  const [bookingForm, setBookingForm] = useState<Omit<Booking, 'id' | 'total_amount' | 'room_details' | 'guest_details'>>(
    emptyBooking,
  );
  const [availabilityRange, setAvailabilityRange] = useState({ check_in_date: '', check_out_date: '' });

  const { data: bookableRooms, isFetching: roomsLoading } = useAvailableRooms(
    bookingForm.check_in_date,
    bookingForm.check_out_date,
  );
  const { data: availableRooms, isFetching: availabilityLoading } = useAvailableRooms(
    availabilityRange.check_in_date,
    availabilityRange.check_out_date,
  );

  const selectedRoom = useMemo(
    () => bookableRooms?.find((room) => room.id === bookingForm.room),
    [bookableRooms, bookingForm.room],
  );

  const estimatedTotal = useMemo(() => {
    if (!selectedRoom || !bookingForm.check_in_date || !bookingForm.check_out_date) return 0;
    const checkIn = new Date(bookingForm.check_in_date);
    const checkOut = new Date(bookingForm.check_out_date);
    const nights = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
    return nights * Number(selectedRoom.price_per_night);
  }, [bookingForm.check_in_date, bookingForm.check_out_date, selectedRoom]);

  const bookingCounts = useMemo(
    () => ({
      active: bookings?.filter((booking) => ['confirmed', 'checked_in'].includes(booking.status)).length || 0,
      checkedIn: bookings?.filter((booking) => booking.status === 'checked_in').length || 0,
      openFolios: folios?.filter((folio) => folio.status === 'open').length || 0,
    }),
    [bookings, folios],
  );

  const tabs = [
    { id: 'reservations', label: 'Reservations', count: bookingCounts.active },
    { id: 'guests', label: 'Guests', count: guests?.length || 0 },
    { id: 'availability', label: 'Availability' },
    { id: 'folios', label: 'Folios', count: bookingCounts.openFolios },
    { id: 'new', label: 'New Booking' },
  ];

  const handleCreateGuest = (e: React.FormEvent) => {
    e.preventDefault();
    createGuest.mutate(guestForm, {
      onSuccess: (guest) => {
        setGuestForm(emptyGuest);
        setBookingForm({ ...bookingForm, guest: guest.id });
        setActiveTab('new');
      },
    });
  };

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    createBooking.mutate(bookingForm, {
      onSuccess: () => {
        setBookingForm(emptyBooking);
        setActiveTab('reservations');
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
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Front desk</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Bookings</h1>
          <p className="mt-1 text-sm text-slate-600">Manage reservations, guests, availability, and folio settlement.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right text-xs text-slate-500">
          <span>
            <strong className="block text-lg text-slate-900">{bookingCounts.active}</strong>
            active
          </span>
          <span>
            <strong className="block text-lg text-slate-900">{bookingCounts.checkedIn}</strong>
            in house
          </span>
          <span>
            <strong className="block text-lg text-slate-900">{bookingCounts.openFolios}</strong>
            open folios
          </span>
        </div>
      </div>

      <CompactTabs tabs={tabs} activeTab={activeTab} onChange={(tabId) => setActiveTab(tabId as BookingTab)} />

      {activeTab === 'reservations' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Reservation</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Stay</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings?.map((booking) => (
                  <tr key={booking.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      #{booking.id.slice(-8)}
                      <span className="block text-xs font-normal text-slate-500">Room {booking.room_details?.room_number || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {booking.guest_details?.first_name} {booking.guest_details?.last_name}
                      <span className="block text-xs text-slate-500">{booking.guest_details?.email}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {booking.check_in_date} to {booking.check_out_date}
                      <span className="block text-xs text-slate-500">{booking.number_of_guests} guest(s)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatMoney(booking.total_amount, settings?.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[booking.status]}`}>
                        {booking.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {booking.status === 'confirmed' && (
                          <>
                            <button
                              onClick={() => bookingAction.mutate({ bookingId: booking.id, action: 'check_in' })}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Check in
                            </button>
                            <button
                              onClick={() => bookingAction.mutate({ bookingId: booking.id, action: 'cancel' })}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {booking.status === 'checked_in' && (
                          <button
                            onClick={() => openCheckout(booking)}
                            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                          >
                            Check out
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bookings?.length === 0 && <p className="p-4 text-sm text-slate-600">No reservations created yet.</p>}
        </section>
      )}

      {activeTab === 'guests' && (
        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form onSubmit={handleCreateGuest} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Add Guest</h2>
            <div className="mt-3 grid gap-3">
              <input placeholder="First name" value={guestForm.first_name} onChange={(e) => setGuestForm({ ...guestForm, first_name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input placeholder="Last name" value={guestForm.last_name} onChange={(e) => setGuestForm({ ...guestForm, last_name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input type="email" placeholder="Email" value={guestForm.email} onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input placeholder="Phone" value={guestForm.phone} onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="ID type" value={guestForm.id_type} onChange={(e) => setGuestForm({ ...guestForm, id_type: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input placeholder="ID number" value={guestForm.id_number} onChange={(e) => setGuestForm({ ...guestForm, id_number: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <textarea placeholder="Address" value={guestForm.address} onChange={(e) => setGuestForm({ ...guestForm, address: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            {createGuest.isError && <p className="mt-3 text-sm text-red-600">Could not create guest.</p>}
            <button type="submit" className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Save guest
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guests?.map((guest) => (
                  <tr key={guest.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {guest.first_name} {guest.last_name}
                      <span className="block text-xs font-normal text-slate-500">{guest.email}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{guest.phone || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {guest.id_type || '-'} {guest.id_number}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {guests?.length === 0 && <p className="p-4 text-sm text-slate-600">No guests yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'availability' && (
        <section className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto]">
            <input type="date" value={availabilityRange.check_in_date} onChange={(e) => setAvailabilityRange({ ...availabilityRange, check_in_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={availabilityRange.check_out_date} onChange={(e) => setAvailabilityRange({ ...availabilityRange, check_out_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button type="button" onClick={() => setActiveTab('new')} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              New booking
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Capacity</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {availableRooms?.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">Room {room.room_number}</td>
                    <td className="px-4 py-3 text-slate-700">{room.room_type_name}</td>
                    <td className="px-4 py-3 text-slate-700">{room.capacity}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(room.price_per_night, settings?.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {availabilityLoading && <p className="p-4 text-sm text-slate-600">Checking availability...</p>}
            {!availabilityRange.check_in_date || !availabilityRange.check_out_date ? (
              <p className="p-4 text-sm text-slate-600">Select dates to view available rooms.</p>
            ) : availableRooms?.length === 0 ? (
              <p className="p-4 text-sm text-slate-600">No available rooms for the selected dates.</p>
            ) : null}
          </div>
        </section>
      )}

      {activeTab === 'folios' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Folio</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Stay</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {folios?.map((folio) => (
                  <tr key={folio.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {folio.folio_number}
                      <span className="block text-xs font-normal text-slate-500">Room {folio.room_number}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{folio.guest_name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {folio.check_in_date} to {folio.check_out_date}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(folio.grand_total, settings?.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[folio.status]}`}>{folio.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {folios?.length === 0 && <p className="p-4 text-sm text-slate-600">No folios yet.</p>}
        </section>
      )}

      {activeTab === 'new' && (
        <form onSubmit={handleCreateBooking} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <select value={bookingForm.guest} onChange={(e) => setBookingForm({ ...bookingForm, guest: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
              <option value="">Select guest</option>
              {guests?.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.first_name} {guest.last_name} - {guest.email}
                </option>
              ))}
            </select>
            <input type="number" value={bookingForm.number_of_guests} onChange={(e) => setBookingForm({ ...bookingForm, number_of_guests: Number(e.target.value) })} min="1" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input type="date" value={bookingForm.check_in_date} onChange={(e) => setBookingForm({ ...bookingForm, check_in_date: e.target.value, room: '' })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input type="date" value={bookingForm.check_out_date} onChange={(e) => setBookingForm({ ...bookingForm, check_out_date: e.target.value, room: '' })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <select value={bookingForm.room} onChange={(e) => setBookingForm({ ...bookingForm, room: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required disabled={!bookingForm.check_in_date || !bookingForm.check_out_date}>
              <option value="">{roomsLoading ? 'Checking rooms...' : 'Select available room'}</option>
              {bookableRooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.room_number} - {room.room_type_name} - {formatMoney(room.price_per_night, settings?.currency)}
                </option>
              ))}
            </select>
            <select value={bookingForm.status} onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value as Booking['status'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked in</option>
            </select>
            <textarea placeholder="Special requests" value={bookingForm.special_requests} onChange={(e) => setBookingForm({ ...bookingForm, special_requests: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              Estimated total: <span className="font-semibold text-slate-900">{formatMoney(estimatedTotal, settings?.currency)}</span>
            </p>
            <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Create reservation
            </button>
          </div>
          {createBooking.isError && <p className="mt-3 text-sm text-red-600">Could not create reservation.</p>}
        </form>
      )}

      {checkoutBooking && (
        <form onSubmit={handleCheckout} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_160px_auto] md:items-end">
            <div>
              <p className="text-sm font-semibold text-slate-900">Checkout #{checkoutBooking.id.slice(-8)}</p>
              <p className="text-xs text-slate-500">
                Total due {formatMoney(checkoutBooking.folio_details?.grand_total || checkoutBooking.total_amount, settings?.currency)}
              </p>
            </div>
            <select value={checkoutPayment.payment_method} onChange={(e) => setCheckoutPayment({ ...checkoutPayment, payment_method: e.target.value as CheckoutPaymentMethod })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
            <input type="number" step="0.01" value={checkoutPayment.paid_amount} onChange={(e) => setCheckoutPayment({ ...checkoutPayment, paid_amount: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <div className="flex gap-2">
              <button type="submit" className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
                Confirm
              </button>
              <button type="button" onClick={() => setCheckoutBooking(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
          {bookingAction.isError && <p className="mt-3 text-sm text-red-600">Could not complete checkout.</p>}
        </form>
      )}
    </div>
  );
};

export default Bookings;
