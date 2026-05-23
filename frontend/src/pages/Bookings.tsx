import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import {
  downloadBookingConfirmationPdf,
  downloadGuestFolioPdf,
  useAvailableRooms,
  useBookingAction,
  useBookings,
  useCreateBooking,
  useCreateGuestCommunication,
  useCreateGuest,
  useCreateGuestFollowUp,
  useCreateWalkInBooking,
  useGuestCommunications,
  useGuestFollowUpAction,
  useGuestFollowUps,
  useGuestFolios,
  useGuestHistory,
  useGuests,
  useRooms,
  useUpdateGuest,
} from '../hooks/bookings';
import { usePermissions } from '../hooks/permissions';
import { useCurrentCashierShift } from '../hooks/restaurant';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { Booking, Guest, GuestCommunication, GuestFolio, GuestFolioLine, GuestFollowUpReminder } from '../types/bookings';

const emptyGuest = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  id_type: '',
  id_number: '',
  vip_level: 'standard' as Guest['vip_level'],
  preferences: {},
  notes: '',
  marketing_opt_in: false,
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

const emptyCommunication = {
  channel: 'note' as GuestCommunication['channel'],
  direction: 'internal' as GuestCommunication['direction'],
  subject: '',
  message: '',
  status: 'logged' as GuestCommunication['status'],
  booking: '',
};

const emptyFollowUp = {
  reminder_type: 'custom' as GuestFollowUpReminder['reminder_type'],
  priority: 'normal' as GuestFollowUpReminder['priority'],
  subject: '',
  message: '',
  due_at: '',
  booking: '',
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

const formatFolioLineSource = (line: GuestFolioLine) => {
  if (line.source_module === 'restaurant_order') return 'Restaurant order';
  if (line.source_module === 'room_charge') return 'Room charge';
  if (line.source_module === 'room_transfer') return 'Room transfer';
  if (line.source_module === 'booking_extension') return 'Stay extension';
  if (line.source_module.startsWith('facility_')) {
    return line.source_module
      .replace('facility_', '')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return line.source_module
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

type CheckoutPaymentMethod = (typeof paymentMethods)[number]['value'];
type BookingTab = 'reservations' | 'guests' | 'availability' | 'folios' | 'new';

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

const formatDayLabel = (date: string) => {
  const value = new Date(`${date}T00:00:00`);
  return value.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatWeekday = (date: string) => {
  const value = new Date(`${date}T00:00:00`);
  return value.toLocaleDateString([], { weekday: 'short' });
};

const Bookings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: currentShift } = useCurrentCashierShift();
  const { data: bookings, isLoading, error } = useBookings();
  const { data: guests } = useGuests();
  const { data: folios } = useGuestFolios();
  const { data: rooms } = useRooms();
  const createGuest = useCreateGuest();
  const updateGuest = useUpdateGuest();
  const createCommunication = useCreateGuestCommunication();
  const createFollowUp = useCreateGuestFollowUp();
  const followUpAction = useGuestFollowUpAction();
  const createBooking = useCreateBooking();
  const createWalkInBooking = useCreateWalkInBooking();
  const bookingAction = useBookingAction();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState<BookingTab>((searchParams.get('tab') as BookingTab | null) || 'reservations');
  const [bookingFilter, setBookingFilter] = useState(searchParams.get('filter') || 'all');
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null);
  const [extensionBooking, setExtensionBooking] = useState<Booking | null>(null);
  const [modificationBooking, setModificationBooking] = useState<Booking | null>(null);
  const [transferBooking, setTransferBooking] = useState<Booking | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState(searchParams.get('guest') || '');
  const [guestSearch, setGuestSearch] = useState('');
  const [isAddingGuestInBooking, setIsAddingGuestInBooking] = useState(false);
  const [guestProfileForm, setGuestProfileForm] = useState({ vip_level: 'standard' as Guest['vip_level'], notes: '', preferencesText: '', marketing_opt_in: false });
  const [communicationForm, setCommunicationForm] = useState(emptyCommunication);
  const [followUpForm, setFollowUpForm] = useState(emptyFollowUp);
  const [checkoutPayment, setCheckoutPayment] = useState<{ payment_method: CheckoutPaymentMethod; paid_amount: string }>({
    payment_method: 'cash',
    paid_amount: '',
  });
  const [extensionForm, setExtensionForm] = useState({ check_out_date: '' });
  const [modificationForm, setModificationForm] = useState({
    room: '',
    check_in_date: '',
    check_out_date: '',
    number_of_guests: 1,
    special_requests: '',
  });
  const [transferForm, setTransferForm] = useState({ room: '' });
  const [selectedFolio, setSelectedFolio] = useState<GuestFolio | null>(null);
  const [calendarStart, setCalendarStart] = useState(new Date().toISOString().slice(0, 10));
  const [guestForm, setGuestForm] = useState<Omit<Guest, 'id'>>(emptyGuest);
  const [bookingGuestForm, setBookingGuestForm] = useState<Omit<Guest, 'id'>>(emptyGuest);
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
  const { data: transferRooms, isFetching: transferRoomsLoading } = useAvailableRooms(
    transferBooking?.check_in_date,
    transferBooking?.check_out_date,
  );
  const { data: guestHistory, isFetching: guestHistoryLoading } = useGuestHistory(selectedGuestId);
  const { data: guestCommunications, isFetching: guestCommunicationsLoading } = useGuestCommunications(selectedGuestId);
  const { data: guestFollowUps, isFetching: guestFollowUpsLoading } = useGuestFollowUps({ guest: selectedGuestId }, Boolean(selectedGuestId));

  const selectedRoom = useMemo(
    () => bookableRooms?.find((room) => room.id === bookingForm.room),
    [bookableRooms, bookingForm.room],
  );

  const selectedBookingGuest = useMemo(
    () => guests?.find((guest) => guest.id === bookingForm.guest),
    [bookingForm.guest, guests],
  );

  const selectedBookingGuestHistory = useMemo(() => {
    if (!selectedBookingGuest) return { bookings: [] as Booking[], folios: [] as GuestFolio[] };
    return {
      bookings: (bookings || []).filter((booking) => booking.guest === selectedBookingGuest.id),
      folios: (folios || []).filter((folio) => folio.guest_name === `${selectedBookingGuest.first_name} ${selectedBookingGuest.last_name}`),
    };
  }, [bookings, folios, selectedBookingGuest]);

  const filteredGuests = useMemo(() => {
    const search = guestSearch.trim().toLowerCase();
    if (!search) return (guests || []).slice(0, 6);
    return (guests || [])
      .filter((guest) =>
        [guest.first_name, guest.last_name, guest.email, guest.phone, guest.id_number]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
      .slice(0, 8);
  }, [guestSearch, guests]);

  useEffect(() => {
    if (!guestHistory?.guest) return;
    setGuestProfileForm({
      vip_level: guestHistory.guest.vip_level,
      notes: guestHistory.guest.notes || '',
      preferencesText: Object.entries(guestHistory.guest.preferences || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'),
      marketing_opt_in: guestHistory.guest.marketing_opt_in,
    });
    setCommunicationForm(emptyCommunication);
  }, [guestHistory]);

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

  const today = new Date().toISOString().slice(0, 10);
  const visibleBookings = useMemo(() => {
    const records = bookings || [];
    if (bookingFilter === 'arrivals_today') {
      return records.filter((booking) => booking.check_in_date === today && booking.status === 'confirmed');
    }
    if (bookingFilter === 'departures_today') {
      return records.filter((booking) => booking.check_out_date === today && booking.status === 'checked_in');
    }
    if (bookingFilter === 'confirmed') {
      return records.filter((booking) => booking.status === 'confirmed');
    }
    if (bookingFilter === 'checked_in') {
      return records.filter((booking) => booking.status === 'checked_in');
    }
    return records;
  }, [bookingFilter, bookings, today]);

  const filterLabel: Record<string, string> = {
    all: 'All reservations',
    arrivals_today: 'Arrivals today',
    departures_today: 'Departures today',
    confirmed: 'Confirmed reservations',
    checked_in: 'In-house guests',
  };

  const calendarDays = useMemo(
    () => Array.from({ length: 14 }, (_item, index) => addDays(calendarStart, index)),
    [calendarStart],
  );

  const getRoomDayBooking = (roomId: string, day: string) => {
    return (bookings || []).find(
      (booking) =>
        booking.room === roomId &&
        ['confirmed', 'checked_in'].includes(booking.status) &&
        booking.check_in_date <= day &&
        booking.check_out_date > day,
    );
  };

  const getCalendarCell = (roomId: string, day: string) => {
    const room = rooms?.find((item) => item.id === roomId);
    const booking = getRoomDayBooking(roomId, day);
    if (booking) {
      return {
        label: booking.status === 'checked_in' ? 'In house' : 'Reserved',
        detail: booking.guest_details ? `${booking.guest_details.first_name} ${booking.guest_details.last_name}` : 'Guest',
        className: booking.status === 'checked_in' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800',
      };
    }
    if (room?.status === 'maintenance') {
      return { label: 'Maint.', detail: 'Unavailable', className: 'bg-rose-100 text-rose-800' };
    }
    if (room?.status === 'cleaning') {
      return { label: 'Clean', detail: 'Housekeeping', className: 'bg-amber-100 text-amber-800' };
    }
    return { label: 'Open', detail: 'Available', className: 'bg-slate-50 text-slate-500' };
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId as BookingTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tabId);
    if (tabId !== 'reservations' && tabId !== 'folios') {
      nextParams.delete('filter');
      setBookingFilter('all');
    }
    if (tabId !== 'guests') {
      nextParams.delete('guest');
    }
    setSearchParams(nextParams);
  };

  const clearBookingFilter = () => {
    setBookingFilter('all');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('filter');
    setSearchParams(nextParams);
  };

  const tabs = [
    { id: 'reservations', label: 'Reservations', count: bookingCounts.active },
    { id: 'guests', label: 'Guests', count: guests?.length || 0 },
    { id: 'availability', label: 'Availability' },
    { id: 'folios', label: 'Folios', count: bookingCounts.openFolios },
    ...(can('bookings.reservation.create') ? [{ id: 'new', label: 'New Booking' }] : []),
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
    if (!bookingForm.guest) return;
    const onSuccess = () => {
      setBookingForm(emptyBooking);
      setGuestSearch('');
      setActiveTab('reservations');
    };
    if (bookingForm.status === 'checked_in') {
      createWalkInBooking.mutate(bookingForm, { onSuccess });
      return;
    }
    createBooking.mutate(bookingForm, { onSuccess });
  };

  const selectGuestForBooking = (guest: Guest) => {
    const preferences = Object.entries(guest.preferences || {})
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    setBookingForm({
      ...bookingForm,
      guest: guest.id,
      special_requests: bookingForm.special_requests || preferences,
    });
    setGuestSearch(`${guest.first_name} ${guest.last_name} ${guest.email}`);
    setIsAddingGuestInBooking(false);
  };

  const handleCreateGuestForBooking = () => {
    if (!bookingGuestForm.first_name || !bookingGuestForm.last_name || !bookingGuestForm.email) return;
    createGuest.mutate(bookingGuestForm, {
      onSuccess: (guest) => {
        setBookingGuestForm(emptyGuest);
        selectGuestForBooking(guest);
      },
    });
  };

  const openGuestProfile = (guestId?: string) => {
    if (!guestId) return;
    setSelectedGuestId(guestId);
    setActiveTab('guests');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'guests');
    nextParams.set('guest', guestId);
    nextParams.delete('filter');
    setSearchParams(nextParams);
  };

  const parsePreferences = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((result, line) => {
        const [key, ...rest] = line.split(':');
        if (key && rest.length) {
          result[key.trim()] = rest.join(':').trim();
        }
        return result;
      }, {});

  const handleUpdateGuestProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuestId) return;
    updateGuest.mutate({
      guestId: selectedGuestId,
      payload: {
        vip_level: guestProfileForm.vip_level,
        notes: guestProfileForm.notes,
        preferences: parsePreferences(guestProfileForm.preferencesText),
        marketing_opt_in: guestProfileForm.marketing_opt_in,
      },
    });
  };

  const handleCreateCommunication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuestId || !communicationForm.message.trim()) return;
    createCommunication.mutate(
      {
        guest: selectedGuestId,
        booking: communicationForm.booking || undefined,
        channel: communicationForm.channel,
        direction: communicationForm.direction,
        subject: communicationForm.subject,
        message: communicationForm.message,
        status: communicationForm.status,
      },
      {
        onSuccess: () => setCommunicationForm(emptyCommunication),
      },
    );
  };

  const handleCreateFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuestId || !followUpForm.subject.trim() || !followUpForm.due_at) return;
    createFollowUp.mutate(
      {
        guest: selectedGuestId,
        booking: followUpForm.booking || undefined,
        reminder_type: followUpForm.reminder_type,
        priority: followUpForm.priority,
        subject: followUpForm.subject,
        message: followUpForm.message,
        due_at: new Date(followUpForm.due_at).toISOString(),
      },
      {
        onSuccess: () => setFollowUpForm(emptyFollowUp),
      },
    );
  };

  const handleFollowUpAction = (reminderId: string, action: 'complete' | 'snooze' | 'cancel') => {
    const notes = window.prompt(action === 'complete' ? 'Completion note' : 'Follow-up note', '');
    if (notes === null) return;
    if (action === 'snooze') {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
      const snoozedUntil = window.prompt('Snooze until', tomorrow);
      if (!snoozedUntil) return;
      followUpAction.mutate({ reminderId, action, notes, snoozed_until: new Date(snoozedUntil).toISOString() });
      return;
    }
    followUpAction.mutate({ reminderId, action, notes });
  };

  const openCheckout = (booking: Booking) => {
    const amountDue = booking.folio_details?.grand_total || booking.total_amount;
    setCheckoutBooking(booking);
    setCheckoutPayment({ payment_method: 'cash', paid_amount: amountDue });
  };

  const openExtension = (booking: Booking) => {
    setExtensionBooking(booking);
    setExtensionForm({ check_out_date: booking.check_out_date });
  };

  const openModification = (booking: Booking) => {
    setModificationBooking(booking);
    setModificationForm({
      room: booking.room,
      check_in_date: booking.check_in_date,
      check_out_date: booking.check_out_date,
      number_of_guests: booking.number_of_guests,
      special_requests: booking.special_requests || '',
    });
  };

  const openTransfer = (booking: Booking) => {
    setTransferBooking(booking);
    setTransferForm({ room: '' });
  };

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutBooking) return;
    bookingAction.mutate(
      {
        bookingId: checkoutBooking.id,
        action: 'check_out',
        payload: { ...checkoutPayment, cashier_shift: currentShift?.id },
      },
      {
        onSuccess: (result) => {
          const settledFolio = (result as { folio?: GuestFolio }).folio;
          setCheckoutBooking(null);
          if (settledFolio) setSelectedFolio(settledFolio);
        },
      },
    );
  };

  const getCheckoutReadiness = (booking: Booking) => {
    const folio = booking.folio_details;
    const lines = folio?.lines || [];
    const restaurantLines = lines.filter((line) => line.source_module === 'restaurant_order');
    const facilityLines = lines.filter((line) => line.source_module.startsWith('facility_'));
    const roomChargeLines = lines.filter((line) => line.source_module === 'room_charge');
    return {
      folio,
      hasOpenFolio: folio?.status === 'open',
      roomChargeLines,
      restaurantLines,
      facilityLines,
      totalDue: folio?.grand_total || booking.total_amount,
    };
  };

  const handleExtendStay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extensionBooking) return;
    bookingAction.mutate(
      {
        bookingId: extensionBooking.id,
        action: 'extend-stay',
        payload: extensionForm,
      },
      {
        onSuccess: () => setExtensionBooking(null),
      },
    );
  };

  const handleModifyBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modificationBooking) return;
    bookingAction.mutate(
      {
        bookingId: modificationBooking.id,
        action: 'modify',
        payload: modificationForm,
      },
      {
        onSuccess: () => setModificationBooking(null),
      },
    );
  };

  const handleTransferRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferBooking) return;
    bookingAction.mutate(
      {
        bookingId: transferBooking.id,
        action: 'transfer-room',
        payload: transferForm,
      },
      {
        onSuccess: () => setTransferBooking(null),
      },
    );
  };

  const handleDownloadBookingPdf = (bookingId: string) => {
    downloadBookingConfirmationPdf(bookingId);
  };

  const handleDownloadFolioPdf = (folio: GuestFolio) => {
    downloadGuestFolioPdf(folio.id, folio.folio_number);
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

      <CompactTabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />

      {activeTab === 'reservations' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{filterLabel[bookingFilter] || 'Reservations'}</h2>
              <p className="mt-1 text-sm text-slate-500">{visibleBookings.length} matching booking(s)</p>
            </div>
            {bookingFilter !== 'all' && (
              <button type="button" onClick={clearBookingFilter} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Show all
              </button>
            )}
          </div>
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
                {visibleBookings.map((booking) => (
                  <tr key={booking.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      #{booking.id.slice(-8)}
                      <span className="block text-xs font-normal text-slate-500">Room {booking.room_details?.room_number || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <button
                        type="button"
                        onClick={() => openGuestProfile(booking.guest)}
                        className="font-medium text-emerald-700 hover:text-emerald-800"
                      >
                        {booking.guest_details?.first_name} {booking.guest_details?.last_name}
                      </button>
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
                      {booking.folio_details && (
                        <button
                          type="button"
                          onClick={() => setSelectedFolio(booking.folio_details || null)}
                          className="mt-2 block text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          {booking.folio_details.folio_number}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadBookingPdf(booking.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          PDF
                        </button>
                        {booking.status === 'confirmed' && can('bookings.reservation.create') && (
                          <>
                            <button
                              onClick={() => openModification(booking)}
                              className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            >
                              Modify
                            </button>
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
                        {booking.status === 'checked_in' && can(['bookings.reservation.create', 'bookings.reservation.check_out']) && (
                          <>
                            {can('bookings.reservation.create') && (
                              <>
                                <button
                                  onClick={() => openExtension(booking)}
                                  className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  Extend
                                </button>
                                <button
                                  onClick={() => openTransfer(booking)}
                                  className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
                                >
                                  Transfer
                                </button>
                              </>
                            )}
                            {can('bookings.reservation.check_out') && (
                              <button
                                onClick={() => openCheckout(booking)}
                                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                              >
                                Check out
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleBookings.length === 0 && <p className="p-4 text-sm text-slate-600">No matching reservations.</p>}
        </section>
      )}

      {activeTab === 'guests' && (
        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          {can('bookings.reservation.create') && <form onSubmit={handleCreateGuest} className="rounded-2xl border border-slate-200 bg-white p-4">
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
              <select value={guestForm.vip_level} onChange={(e) => setGuestForm({ ...guestForm, vip_level: e.target.value as Guest['vip_level'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="standard">Standard</option>
                <option value="vip">VIP</option>
                <option value="blacklist">Do not book</option>
              </select>
              <textarea placeholder="Address" value={guestForm.address} onChange={(e) => setGuestForm({ ...guestForm, address: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea placeholder="Guest notes" value={guestForm.notes} onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={guestForm.marketing_opt_in} onChange={(e) => setGuestForm({ ...guestForm, marketing_opt_in: e.target.checked })} />
                Marketing opt-in
              </label>
            </div>
            {createGuest.isError && <p className="mt-3 text-sm text-red-600">Could not create guest.</p>}
            <button type="submit" className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Save guest
            </button>
          </form>}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guests?.map((guest) => (
                  <tr key={guest.id} className={`hover:bg-slate-50/70 ${selectedGuestId === guest.id ? 'bg-emerald-50/70' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {guest.first_name} {guest.last_name}
                      <span className="block text-xs font-normal text-slate-500">{guest.email}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{guest.phone || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {guest.id_type || '-'} {guest.id_number}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{guest.vip_level.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => openGuestProfile(guest.id)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {guests?.length === 0 && <p className="p-4 text-sm text-slate-600">No guests yet.</p>}
          </div>

          {selectedGuestId && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
              {guestHistoryLoading || !guestHistory ? (
                <p className="text-sm text-slate-600">Loading guest profile...</p>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                  {can('bookings.reservation.create') ? <form onSubmit={handleUpdateGuestProfile} className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Guest profile</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">
                        {guestHistory.guest.first_name} {guestHistory.guest.last_name}
                      </h2>
                      <p className="text-sm text-slate-500">{guestHistory.guest.email}</p>
                    </div>
                    <select value={guestProfileForm.vip_level} onChange={(e) => setGuestProfileForm({ ...guestProfileForm, vip_level: e.target.value as Guest['vip_level'] })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <option value="standard">Standard</option>
                      <option value="vip">VIP</option>
                      <option value="blacklist">Do not book</option>
                    </select>
                    <textarea placeholder="Preferences, one per line: pillow: soft" value={guestProfileForm.preferencesText} onChange={(e) => setGuestProfileForm({ ...guestProfileForm, preferencesText: e.target.value })} className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <textarea placeholder="Internal notes" value={guestProfileForm.notes} onChange={(e) => setGuestProfileForm({ ...guestProfileForm, notes: e.target.value })} className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={guestProfileForm.marketing_opt_in} onChange={(e) => setGuestProfileForm({ ...guestProfileForm, marketing_opt_in: e.target.checked })} />
                      Marketing opt-in
                    </label>
                    <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                      Save profile
                    </button>
                    {updateGuest.isError && <p className="text-sm text-red-600">Could not update guest profile.</p>}
                  </form> : (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Guest profile</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">
                        {guestHistory.guest.first_name} {guestHistory.guest.last_name}
                      </h2>
                      <p className="text-sm text-slate-500">{guestHistory.guest.email}</p>
                      <p className="mt-3 text-sm text-slate-600">{guestHistory.guest.notes || 'No internal notes recorded.'}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      {[
                        ['Bookings', guestHistory.summary.total_bookings],
                        ['Completed stays', guestHistory.summary.completed_stays],
                        ['Open folios', guestHistory.summary.open_folios],
                        ['Lifetime value', formatMoney(guestHistory.summary.lifetime_value, settings?.currency)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                      {can('bookings.reservation.create') && <form onSubmit={handleCreateFollowUp} className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                        <h3 className="text-sm font-semibold text-slate-900">Create follow-up</h3>
                        <div className="mt-3 grid gap-2">
                          <select value={followUpForm.reminder_type} onChange={(e) => setFollowUpForm({ ...followUpForm, reminder_type: e.target.value as GuestFollowUpReminder['reminder_type'] })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                            <option value="custom">Custom</option>
                            <option value="arrival">Arrival</option>
                            <option value="vip">VIP</option>
                            <option value="payment">Payment</option>
                            <option value="post_stay">Post-stay</option>
                          </select>
                          <select value={followUpForm.priority} onChange={(e) => setFollowUpForm({ ...followUpForm, priority: e.target.value as GuestFollowUpReminder['priority'] })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                          <select value={followUpForm.booking} onChange={(e) => setFollowUpForm({ ...followUpForm, booking: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                            <option value="">No booking link</option>
                            {guestHistory.bookings.map((booking) => (
                              <option key={booking.id} value={booking.id}>
                                {booking.check_in_date} to {booking.check_out_date} - Room {booking.room_details?.room_number || '-'}
                              </option>
                            ))}
                          </select>
                          <input type="datetime-local" value={followUpForm.due_at} onChange={(e) => setFollowUpForm({ ...followUpForm, due_at: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" required />
                          <input value={followUpForm.subject} onChange={(e) => setFollowUpForm({ ...followUpForm, subject: e.target.value })} placeholder="Subject" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" required />
                          <textarea value={followUpForm.message} onChange={(e) => setFollowUpForm({ ...followUpForm, message: e.target.value })} placeholder="Follow-up details" className="min-h-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                          <button type="submit" disabled={createFollowUp.isPending || !followUpForm.subject.trim() || !followUpForm.due_at} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                            Save follow-up
                          </button>
                          {createFollowUp.isError && <p className="text-sm text-red-600">Could not save follow-up.</p>}
                        </div>
                      </form>}
                      <div className="rounded-xl border border-sky-100 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">Follow-up reminders</h3>
                          <span className="text-xs text-slate-500">{guestFollowUps?.length || 0} item(s)</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {guestFollowUpsLoading && <p className="text-sm text-slate-600">Loading follow-ups...</p>}
                          {guestFollowUps?.map((reminder) => (
                            <article key={reminder.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-slate-900">{reminder.subject}</p>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{reminder.status}</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">{reminder.message || 'No details.'}</p>
                              <p className="mt-2 text-xs text-slate-500">{reminder.reminder_type.replace('_', ' ')} - due {new Date(reminder.due_at).toLocaleString()}</p>
                              {can('bookings.reservation.create') && ['open', 'snoozed'].includes(reminder.status) && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button onClick={() => handleFollowUpAction(reminder.id, 'complete')} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Complete</button>
                                  <button onClick={() => handleFollowUpAction(reminder.id, 'snooze')} className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50">Snooze</button>
                                  <button onClick={() => handleFollowUpAction(reminder.id, 'cancel')} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">Cancel</button>
                                </div>
                              )}
                            </article>
                          ))}
                          {!guestFollowUpsLoading && guestFollowUps?.length === 0 && <p className="text-sm text-slate-600">No follow-ups for this guest yet.</p>}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                      {can('bookings.reservation.create') && <form onSubmit={handleCreateCommunication} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <h3 className="text-sm font-semibold text-slate-900">Log communication</h3>
                        <div className="mt-3 grid gap-2">
                          <select
                            value={communicationForm.channel}
                            onChange={(e) => setCommunicationForm({ ...communicationForm, channel: e.target.value as GuestCommunication['channel'] })}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="note">Internal note</option>
                            <option value="email">Email</option>
                            <option value="phone">Phone</option>
                            <option value="sms">SMS</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="in_person">In person</option>
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={communicationForm.direction}
                              onChange={(e) => setCommunicationForm({ ...communicationForm, direction: e.target.value as GuestCommunication['direction'] })}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="internal">Internal</option>
                              <option value="inbound">Inbound</option>
                              <option value="outbound">Outbound</option>
                            </select>
                            <select
                              value={communicationForm.status}
                              onChange={(e) => setCommunicationForm({ ...communicationForm, status: e.target.value as GuestCommunication['status'] })}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="logged">Logged</option>
                              <option value="sent">Sent</option>
                              <option value="failed">Failed</option>
                              <option value="follow_up">Follow up</option>
                            </select>
                          </div>
                          <select
                            value={communicationForm.booking}
                            onChange={(e) => setCommunicationForm({ ...communicationForm, booking: e.target.value })}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">No booking link</option>
                            {guestHistory.bookings.map((booking) => (
                              <option key={booking.id} value={booking.id}>
                                {booking.check_in_date} to {booking.check_out_date} - Room {booking.room_details?.room_number || '-'}
                              </option>
                            ))}
                          </select>
                          <input
                            value={communicationForm.subject}
                            onChange={(e) => setCommunicationForm({ ...communicationForm, subject: e.target.value })}
                            placeholder="Subject"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                          <textarea
                            value={communicationForm.message}
                            onChange={(e) => setCommunicationForm({ ...communicationForm, message: e.target.value })}
                            placeholder="What happened?"
                            className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            required
                          />
                          <button
                            type="submit"
                            disabled={createCommunication.isPending || !communicationForm.message.trim()}
                            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            Save communication
                          </button>
                          {createCommunication.isError && <p className="text-sm text-red-600">Could not save communication.</p>}
                        </div>
                      </form>}
                      <div className="rounded-xl border border-slate-100 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">Communication timeline</h3>
                          <span className="text-xs text-slate-500">{guestCommunications?.length || 0} item(s)</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {guestCommunicationsLoading && <p className="text-sm text-slate-600">Loading communication timeline...</p>}
                          {guestCommunications?.map((communication) => (
                            <article key={communication.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-slate-900">{communication.subject || communication.channel.replace('_', ' ')}</p>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{communication.status.replace('_', ' ')}</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">{communication.message}</p>
                              <p className="mt-2 text-xs text-slate-500">
                                {new Date(communication.occurred_at).toLocaleString()} - {communication.channel.replace('_', ' ')} - {communication.direction}
                                {communication.booking_reference ? ` - ${communication.booking_reference}` : ''}
                              </p>
                            </article>
                          ))}
                          {!guestCommunicationsLoading && guestCommunications?.length === 0 && (
                            <p className="text-sm text-slate-600">No communication has been logged for this guest yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-100">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Stay</th>
                            <th className="px-3 py-2">Room</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {guestHistory.bookings.map((booking) => (
                            <tr key={booking.id}>
                              <td className="px-3 py-2 text-slate-700">{booking.check_in_date} to {booking.check_out_date}</td>
                              <td className="px-3 py-2 text-slate-700">Room {booking.room_details?.room_number || '-'}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-900">{formatMoney(booking.total_amount, settings?.currency)}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[booking.status]}`}>{booking.status.replace('_', ' ')}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {guestHistory.bookings.length === 0 && <p className="p-3 text-sm text-slate-600">No stay history yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </section>
      )}

      {activeTab === 'availability' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Availability calendar</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDayLabel(calendarDays[0])} to {formatDayLabel(calendarDays[calendarDays.length - 1])}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCalendarStart(addDays(calendarStart, -14))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Previous
                </button>
                <button type="button" onClick={() => setCalendarStart(new Date().toISOString().slice(0, 10))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Today
                </button>
                <button type="button" onClick={() => setCalendarStart(addDays(calendarStart, 14))} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">
                  Next
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[1120px]">
                <div className="grid grid-cols-[150px_repeat(14,minmax(68px,1fr))] border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
                  <div className="sticky left-0 z-10 bg-white px-3 py-2">Room</div>
                  {calendarDays.map((day) => (
                    <div key={day} className="px-2 py-2 text-center">
                      <span className="block">{formatWeekday(day)}</span>
                      <span className="block font-normal normal-case text-slate-400">{formatDayLabel(day)}</span>
                    </div>
                  ))}
                </div>
                {(rooms || []).map((room) => (
                  <div key={room.id} className="grid grid-cols-[150px_repeat(14,minmax(68px,1fr))] border-b border-slate-100 last:border-b-0">
                    <div className="sticky left-0 z-10 bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-slate-900">Room {room.room_number}</p>
                      <p className="text-xs text-slate-500">{room.room_type_name}</p>
                    </div>
                    {calendarDays.map((day) => {
                      const cell = getCalendarCell(room.id, day);
                      return (
                        <div key={`${room.id}-${day}`} className="p-1">
                          <div className={`h-12 rounded-lg px-2 py-1 text-center text-[11px] font-medium ${cell.className}`}>
                            <span className="block truncate">{cell.label}</span>
                            <span className="block truncate text-[10px] font-normal opacity-75">{cell.detail}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {(rooms || []).length === 0 && <p className="p-4 text-sm text-slate-600">No rooms available for calendar display.</p>}
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto]">
            <input type="date" value={availabilityRange.check_in_date} onChange={(e) => setAvailabilityRange({ ...availabilityRange, check_in_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={availabilityRange.check_out_date} onChange={(e) => setAvailabilityRange({ ...availabilityRange, check_out_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            {can('bookings.reservation.create') && (
              <button type="button" onClick={() => setActiveTab('new')} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
                New booking
              </button>
            )}
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
                  <th className="px-4 py-3 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(searchParams.get('filter') === 'open_folios' ? folios?.filter((folio) => folio.status === 'open') : folios)?.map((folio) => (
                  <tr key={folio.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <button type="button" onClick={() => setSelectedFolio(folio)} className="text-left text-emerald-700 hover:underline">
                        {folio.folio_number}
                      </button>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDownloadFolioPdf(folio)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(searchParams.get('filter') === 'open_folios' ? folios?.filter((folio) => folio.status === 'open') : folios)?.length === 0 && <p className="p-4 text-sm text-slate-600">No matching folios.</p>}
        </section>
      )}

      {activeTab === 'new' && can('bookings.reservation.create') && (
        <form onSubmit={handleCreateBooking} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3 md:col-span-2">
              <div>
                <input
                  value={guestSearch}
                  onChange={(e) => {
                    setGuestSearch(e.target.value);
                    setBookingForm({ ...bookingForm, guest: '' });
                  }}
                  placeholder="Search guest by name, email, phone, or ID"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {filteredGuests.map((guest) => {
                  const guestBookings = (bookings || []).filter((booking) => booking.guest === guest.id);
                  const isRegular = guestBookings.filter((booking) => booking.status === 'checked_out').length > 0 || guestBookings.length > 1;
                  return (
                    <button
                      key={guest.id}
                      type="button"
                      onClick={() => selectGuestForBooking(guest)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                        bookingForm.guest === guest.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {guest.first_name} {guest.last_name}
                        </span>
                        {isRegular && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Regular</span>}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{guest.email || guest.phone || 'No contact saved'}</span>
                    </button>
                  );
                })}
              </div>
              {selectedBookingGuest && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {selectedBookingGuest.first_name} {selectedBookingGuest.last_name}
                        {selectedBookingGuest.vip_level !== 'standard' && (
                          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-emerald-700">{selectedBookingGuest.vip_level.replace('_', ' ')}</span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{selectedBookingGuest.email} {selectedBookingGuest.phone ? `- ${selectedBookingGuest.phone}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => openGuestProfile(selectedBookingGuest.id)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                      Open profile
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <span className="rounded-lg bg-white px-3 py-2">
                      <strong className="block text-slate-900">{selectedBookingGuestHistory.bookings.length}</strong>
                      prior booking(s)
                    </span>
                    <span className="rounded-lg bg-white px-3 py-2">
                      <strong className="block text-slate-900">{selectedBookingGuestHistory.bookings.filter((booking) => booking.status === 'checked_out').length}</strong>
                      completed stay(s)
                    </span>
                    <span className="rounded-lg bg-white px-3 py-2">
                      <strong className="block text-slate-900">{selectedBookingGuestHistory.folios.filter((folio) => folio.status === 'open').length}</strong>
                      open folio(s)
                    </span>
                    <span className="rounded-lg bg-white px-3 py-2">
                      <strong className="block text-slate-900">
                        {selectedBookingGuestHistory.bookings[0]?.check_out_date || '-'}
                      </strong>
                      last checkout
                    </span>
                  </div>
                  {(selectedBookingGuest.notes || Object.keys(selectedBookingGuest.preferences || {}).length > 0) && (
                    <p className="mt-3 text-xs text-slate-600">
                      {selectedBookingGuest.notes || Object.entries(selectedBookingGuest.preferences).map(([key, value]) => `${key}: ${value}`).join('; ')}
                    </p>
                  )}
                </div>
              )}
              {!bookingForm.guest && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-xs text-slate-600">No matching guest? Add the guest here and continue this booking.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingGuestInBooking(!isAddingGuestInBooking);
                        const [firstName = '', ...rest] = guestSearch.trim().split(' ');
                        if (!isAddingGuestInBooking && guestSearch.trim()) {
                          setBookingGuestForm({
                            ...bookingGuestForm,
                            first_name: bookingGuestForm.first_name || firstName,
                            last_name: bookingGuestForm.last_name || rest.join(' '),
                          });
                        }
                      }}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      {isAddingGuestInBooking ? 'Hide new guest' : 'Add new guest'}
                    </button>
                  </div>
                  {isAddingGuestInBooking && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input
                        placeholder="First name"
                        value={bookingGuestForm.first_name}
                        onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, first_name: e.target.value })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="Last name"
                        value={bookingGuestForm.last_name}
                        onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, last_name: e.target.value })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={bookingGuestForm.email}
                        onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, email: e.target.value })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="Phone"
                        value={bookingGuestForm.phone}
                        onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, phone: e.target.value })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-3 md:col-span-2">
                        <input
                          placeholder="ID type"
                          value={bookingGuestForm.id_type}
                          onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, id_type: e.target.value })}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                        <input
                          placeholder="ID number"
                          value={bookingGuestForm.id_number}
                          onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, id_number: e.target.value })}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <textarea
                        placeholder="Address"
                        value={bookingGuestForm.address}
                        onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, address: e.target.value })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={bookingGuestForm.marketing_opt_in}
                            onChange={(e) => setBookingGuestForm({ ...bookingGuestForm, marketing_opt_in: e.target.checked })}
                          />
                          Marketing opt-in
                        </label>
                        <button
                          type="button"
                          onClick={handleCreateGuestForBooking}
                          disabled={!bookingGuestForm.first_name || !bookingGuestForm.last_name || !bookingGuestForm.email || createGuest.isPending}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          Save and select guest
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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
              <option value="checked_in">Walk-in check-in</option>
            </select>
            <textarea placeholder="Special requests" value={bookingForm.special_requests} onChange={(e) => setBookingForm({ ...bookingForm, special_requests: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              Estimated total: <span className="font-semibold text-slate-900">{formatMoney(estimatedTotal, settings?.currency)}</span>
            </p>
            <button type="submit" disabled={!bookingForm.guest || createBooking.isPending || createWalkInBooking.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {bookingForm.status === 'checked_in' ? 'Check in walk-in' : 'Create reservation'}
            </button>
          </div>
          {(createBooking.isError || createWalkInBooking.isError) && <p className="mt-3 text-sm text-red-600">Could not create booking. Check dates, guest, and room availability.</p>}
        </form>
      )}

      {selectedFolio && (
        <ActionModal
          title={`${selectedFolio.status === 'paid' ? 'Checkout receipt' : 'Folio'} ${selectedFolio.folio_number}`}
          description={`Room ${selectedFolio.room_number} | ${selectedFolio.guest_name}`}
          onClose={() => setSelectedFolio(null)}
        >
          <div className="receipt-print grid gap-2 text-xs">
            <div className="print-header border-b border-slate-200 pb-2 text-center">
              <h2 className="text-lg font-bold text-slate-900">{settings?.name || 'Hotel'}</h2>
              <p className="mt-1 text-xs text-slate-500">Printed {new Date().toLocaleString()}</p>
              <p className="mt-2 text-xs font-semibold text-slate-900">{selectedFolio.status === 'paid' ? 'Payment Receipt' : 'Guest Folio'}</p>
              <p className="mt-1 text-xs text-slate-700">Folio {selectedFolio.folio_number}</p>
              <p className="mt-1 text-xs text-slate-600">Room {selectedFolio.room_number} | {selectedFolio.guest_name}</p>
            </div>
            <div className="print-metrics grid gap-2 md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs font-medium uppercase text-slate-500">Status</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{selectedFolio.status}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs font-medium uppercase text-slate-500">Stay</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{selectedFolio.check_in_date} to {selectedFolio.check_out_date}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs font-medium uppercase text-slate-500">Total</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatMoney(selectedFolio.grand_total, settings?.currency)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs font-medium uppercase text-slate-500">Payment</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{selectedFolio.payment_method || '-'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs font-medium uppercase text-slate-500">Paid</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatMoney(selectedFolio.paid_amount || '0.00', settings?.currency)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs font-medium uppercase text-slate-500">Paid At</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{selectedFolio.paid_at ? new Date(selectedFolio.paid_at).toLocaleString() : '-'}</p>
              </div>
            </div>
            <div className="print-section overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 pr-4">Description</th><th className="py-3 pr-4">Posted From</th><th className="py-3 pr-4">Reference</th><th className="py-3 pr-4 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedFolio.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900">{line.description}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatFolioLineSource(line)}</td>
                      <td className="py-3 pr-4 text-xs text-slate-500">{line.source_id ? line.source_id.slice(-8) : '-'}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-slate-900">{formatMoney(line.amount, settings?.currency)}</td>
                    </tr>
                  ))}
                  {selectedFolio.lines.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No folio lines yet.</td></tr>}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={3}>Subtotal</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(selectedFolio.subtotal, settings?.currency)}</td></tr>
                  <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={3}>Tax</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(selectedFolio.tax_total, settings?.currency)}</td></tr>
                  <tr><td className="print-total py-3 pr-4 text-base font-bold text-slate-900" colSpan={3}>Grand Total</td><td className="print-total py-3 pr-4 text-right text-base font-bold">{formatMoney(selectedFolio.grand_total, settings?.currency)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setSelectedFolio(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => handleDownloadFolioPdf(selectedFolio)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              PDF
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              {selectedFolio.status === 'paid' ? 'Print receipt' : 'Print folio'}
            </button>
          </div>
        </ActionModal>
      )}

      {modificationBooking && (
        <ActionModal
          title={`Modify reservation #${modificationBooking.id.slice(-8)}`}
          description={`${modificationBooking.guest_details?.first_name || ''} ${modificationBooking.guest_details?.last_name || ''} - Current room ${modificationBooking.room_details?.room_number || '-'}`}
          onClose={() => setModificationBooking(null)}
        >
          <form onSubmit={handleModifyBooking}>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="date"
                value={modificationForm.check_in_date}
                onChange={(e) => setModificationForm({ ...modificationForm, check_in_date: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                type="date"
                value={modificationForm.check_out_date}
                onChange={(e) => setModificationForm({ ...modificationForm, check_out_date: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <select
                value={modificationForm.room}
                onChange={(e) => setModificationForm({ ...modificationForm, room: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select room</option>
                {rooms?.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.room_number} - {room.room_type_name} - {formatMoney(room.price_per_night, settings?.currency)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={modificationForm.number_of_guests}
                onChange={(e) => setModificationForm({ ...modificationForm, number_of_guests: Number(e.target.value) })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <textarea
                value={modificationForm.special_requests}
                onChange={(e) => setModificationForm({ ...modificationForm, special_requests: e.target.value })}
                placeholder="Special requests"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setModificationBooking(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={bookingAction.isPending} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save changes
              </button>
            </div>
            {bookingAction.isError && <p className="mt-3 text-sm text-red-600">Could not modify reservation. Check the dates and room availability.</p>}
          </form>
        </ActionModal>
      )}

      {transferBooking && (
        <ActionModal
          title={`Transfer room #${transferBooking.id.slice(-8)}`}
          description={`Current room ${transferBooking.room_details?.room_number || '-'} - Stay ${transferBooking.check_in_date} to ${transferBooking.check_out_date}`}
          onClose={() => setTransferBooking(null)}
        >
          <form onSubmit={handleTransferRoom}>
            <select
              value={transferForm.room}
              onChange={(e) => setTransferForm({ room: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              required
            >
              <option value="">{transferRoomsLoading ? 'Checking rooms...' : 'Select available room'}</option>
              {transferRooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.room_number} - {room.room_type_name} - {formatMoney(room.price_per_night, settings?.currency)}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setTransferBooking(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={bookingAction.isPending} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                Transfer room
              </button>
            </div>
            {bookingAction.isError && <p className="mt-3 text-sm text-red-600">Could not transfer room. The target room may no longer be available.</p>}
          </form>
        </ActionModal>
      )}

      {extensionBooking && (
        <ActionModal
          title={`Extend stay #${extensionBooking.id.slice(-8)}`}
          description={`Current checkout ${extensionBooking.check_out_date} - Room ${extensionBooking.room_details?.room_number || '-'}`}
          onClose={() => setExtensionBooking(null)}
        >
          <form onSubmit={handleExtendStay}>
            <input
              type="date"
              min={extensionBooking.check_out_date}
              value={extensionForm.check_out_date}
              onChange={(e) => setExtensionForm({ check_out_date: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setExtensionBooking(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={bookingAction.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                Extend stay
              </button>
            </div>
            {bookingAction.isError && <p className="mt-3 text-sm text-red-600">Could not extend stay. The room may be unavailable for the requested dates.</p>}
          </form>
        </ActionModal>
      )}

      {checkoutBooking && (
        <ActionModal
          title={`Checkout #${checkoutBooking.id.slice(-8)}`}
          description={`Total due ${formatMoney(checkoutBooking.folio_details?.grand_total || checkoutBooking.total_amount, settings?.currency)}`}
          onClose={() => setCheckoutBooking(null)}
        >
          {(() => {
            const readiness = getCheckoutReadiness(checkoutBooking);
            return (
              <form onSubmit={handleCheckout}>
                <div className="grid gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900">Checkout Readiness</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Room {checkoutBooking.room_details?.room_number || '-'} | {checkoutBooking.guest_details?.first_name} {checkoutBooking.guest_details?.last_name}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-xs font-medium uppercase text-slate-500">Total Due</p>
                        <p className="text-lg font-bold text-slate-900">{formatMoney(readiness.totalDue, settings?.currency)}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <ReadinessItem label="Room folio" value={readiness.hasOpenFolio ? 'Open' : readiness.folio?.status || 'Missing'} ok={readiness.hasOpenFolio} />
                      <ReadinessItem label="Room charge line" value={`${readiness.roomChargeLines.length} line(s)`} ok={readiness.roomChargeLines.length > 0} />
                      <ReadinessItem label="Restaurant postings" value={`${readiness.restaurantLines.length} line(s)`} ok />
                      <ReadinessItem label="Facility postings" value={`${readiness.facilityLines.length} line(s)`} ok />
                    </div>
                    {readiness.folio && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setSelectedFolio(readiness.folio || null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          Open folio
                        </button>
                        <button type="button" onClick={() => readiness.folio && handleDownloadFolioPdf(readiness.folio)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          Print folio
                        </button>
                        <Link to="/pos" className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                          Settle in POS
                        </Link>
                      </div>
                    )}
                    {!readiness.folio && <p className="mt-3 text-sm text-amber-700">No folio is attached yet. Check-in normally creates the room folio.</p>}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select value={checkoutPayment.payment_method} onChange={(e) => setCheckoutPayment({ ...checkoutPayment, payment_method: e.target.value as CheckoutPaymentMethod })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      {paymentMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                    <input type="number" step="0.01" value={checkoutPayment.paid_amount} onChange={(e) => setCheckoutPayment({ ...checkoutPayment, paid_amount: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => setCheckoutBooking(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={bookingAction.isPending || !readiness.hasOpenFolio} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                    Settle checkout
                  </button>
                </div>
                {bookingAction.isError && <p className="mt-3 text-sm text-red-600">Could not complete checkout.</p>}
              </form>
            );
          })()}
        </ActionModal>
      )}
    </div>
  );
};

const ReadinessItem = ({ label, value, ok }: { label: string; value: string; ok: boolean }) => (
  <div className="rounded-xl bg-white p-3">
    <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
    <p className={`mt-1 text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{value}</p>
  </div>
);

export default Bookings;
