import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Room, RoomType, Guest, Booking, GuestCommunication, GuestFolio, GuestHistory } from '../types/bookings';
import apiClient from '../services/api';

const getList = <T,>(data: T[] | { results: T[] }) => (Array.isArray(data) ? data : data.results);

export const useRooms = () => {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async (): Promise<Room[]> => {
      const response = await apiClient.get<Room[] | { results: Room[] }>('/bookings/rooms/');
      return getList(response.data);
    },
  });
};

export const useAvailableRooms = (checkIn?: string, checkOut?: string) => {
  return useQuery({
    queryKey: ['available-rooms', checkIn, checkOut],
    enabled: Boolean(checkIn && checkOut),
    queryFn: async (): Promise<Room[]> => {
      const response = await apiClient.get<Room[]>('/bookings/bookings/availability/', {
        params: {
          check_in: checkIn,
          check_out: checkOut,
        },
      });
      return response.data;
    },
  });
};

export const useRoomTypes = () => {
  return useQuery({
    queryKey: ['room-types'],
    queryFn: async (): Promise<RoomType[]> => {
      const response = await apiClient.get<RoomType[] | { results: RoomType[] }>('/bookings/room-types/');
      return getList(response.data);
    },
  });
};

export const useGuests = () => {
  return useQuery({
    queryKey: ['guests'],
    queryFn: async (): Promise<Guest[]> => {
      const response = await apiClient.get<Guest[] | { results: Guest[] }>('/bookings/guests/');
      return getList(response.data);
    },
  });
};

export const useGuestHistory = (guestId?: string) => {
  return useQuery({
    queryKey: ['guest-history', guestId],
    enabled: Boolean(guestId),
    queryFn: async (): Promise<GuestHistory> => {
      const response = await apiClient.get<GuestHistory>(`/bookings/guests/${guestId}/history/`);
      return response.data;
    },
  });
};

export const useGuestCommunications = (guestId?: string) => {
  return useQuery({
    queryKey: ['guest-communications', guestId],
    enabled: Boolean(guestId),
    queryFn: async (): Promise<GuestCommunication[]> => {
      const response = await apiClient.get<GuestCommunication[] | { results: GuestCommunication[] }>('/bookings/guest-communications/', {
        params: { guest: guestId },
      });
      return getList(response.data);
    },
  });
};

export const useBookings = () => {
  return useQuery({
    queryKey: ['bookings'],
    queryFn: async (): Promise<Booking[]> => {
      const response = await apiClient.get<Booking[] | { results: Booking[] }>('/bookings/bookings/');
      return getList(response.data);
    },
  });
};

export const useGuestFolios = () => {
  return useQuery({
    queryKey: ['guest-folios'],
    queryFn: async (): Promise<GuestFolio[]> => {
      const response = await apiClient.get<GuestFolio[] | { results: GuestFolio[] }>('/bookings/folios/');
      return getList(response.data);
    },
  });
};

export const useCreateGuest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (guest: Omit<Guest, 'id'>): Promise<Guest> => {
      const response = await apiClient.post('/bookings/guests/', guest);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guests'] }),
  });
};

export const useUpdateGuest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ guestId, payload }: { guestId: string; payload: Partial<Guest> }): Promise<Guest> => {
      const response = await apiClient.patch(`/bookings/guests/${guestId}/`, payload);
      return response.data;
    },
    onSuccess: (_guest, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['guest-history', variables.guestId] });
    },
  });
};

export const useCreateGuestCommunication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      communication: Pick<GuestCommunication, 'guest' | 'channel' | 'direction' | 'subject' | 'message' | 'status'> & {
        booking?: string;
      },
    ): Promise<GuestCommunication> => {
      const response = await apiClient.post('/bookings/guest-communications/', communication);
      return response.data;
    },
    onSuccess: (_communication, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guest-communications', variables.guest] });
      queryClient.invalidateQueries({ queryKey: ['guest-history', variables.guest] });
    },
  });
};

export const useCreateRoom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (room: Omit<Room, 'id' | 'room_type_name' | 'room_type_details'>): Promise<Room> => {
      const response = await apiClient.post('/bookings/rooms/', room);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  });
};

export const useCreateBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (booking: Omit<Booking, 'id' | 'total_amount' | 'room_details' | 'guest_details'>): Promise<Booking> => {
      const response = await apiClient.post('/bookings/bookings/', booking);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
};

export const useCreateWalkInBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (booking: Omit<Booking, 'id' | 'total_amount' | 'room_details' | 'guest_details'>): Promise<{
      status: string;
      booking: Booking;
      folio: GuestFolio;
    }> => {
      const response = await apiClient.post('/bookings/bookings/walk-in/', booking);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['guest-folios'] });
    },
  });
};

export const useBookingAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      action,
      payload,
    }: {
      bookingId: string;
      action: 'check_in' | 'check_out' | 'cancel' | 'modify' | 'extend-stay' | 'transfer-room';
      payload?: Record<string, unknown>;
    }) => {
      const response = await apiClient.post(`/bookings/bookings/${bookingId}/${action}/`, payload || {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['guest-folios'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};

const downloadBlob = (data: BlobPart, filename: string) => {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadBookingConfirmationPdf = async (bookingId: string) => {
  const response = await apiClient.get(`/bookings/bookings/${bookingId}/confirmation-pdf/`, {
    responseType: 'blob',
  });
  downloadBlob(response.data, `reservation-${bookingId}.pdf`);
};

export const downloadGuestFolioPdf = async (folioId: string, folioNumber?: string) => {
  const response = await apiClient.get(`/bookings/folios/${folioId}/pdf/`, {
    responseType: 'blob',
  });
  downloadBlob(response.data, `${folioNumber || `folio-${folioId}`}.pdf`);
};

export const useSettleGuestFolio = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      folioId,
      payment_method,
      paid_amount,
    }: {
      folioId: string;
      payment_method: GuestFolio['payment_method'];
      paid_amount: string;
    }): Promise<GuestFolio> => {
      const response = await apiClient.post(`/bookings/folios/${folioId}/settle/`, {
        payment_method,
        paid_amount,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-folios'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};

export const useCreateRoomType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roomType: Omit<RoomType, 'id'>): Promise<RoomType> => {
      const response = await apiClient.post('/bookings/room-types/', roomType);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['room-types'] }),
  });
};
