import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreateRoom, useCreateRoomType, useRoomTypes, useRooms } from '../hooks/bookings';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { Room, RoomType } from '../types/bookings';

const emptyRoom = {
  room_number: '',
  room_type: '',
  capacity: 1,
  price_per_night: '',
  status: 'available' as Room['status'],
  description: '',
  amenities: {},
};

const emptyRoomType = {
  name: '',
  code: '',
  base_occupancy: 1,
  max_occupancy: 2,
  base_rate: '',
  description: '',
  amenities: {},
  is_active: true,
};

const Rooms: React.FC = () => {
  const { data: rooms, isLoading, error } = useRooms();
  const { data: roomTypes, isLoading: roomTypesLoading } = useRoomTypes();
  const { data: settings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: getTenantSettings,
  });
  const createRoom = useCreateRoom();
  const createRoomType = useCreateRoomType();
  const [activeForm, setActiveForm] = useState<'room' | 'type' | null>(null);
  const [roomForm, setRoomForm] = useState<Partial<Room>>(emptyRoom);
  const [roomTypeForm, setRoomTypeForm] = useState<Omit<RoomType, 'id'>>(emptyRoomType);

  const handleRoomTypeChange = (roomTypeId: string) => {
    const selectedType = roomTypes?.find((roomType) => roomType.id === roomTypeId);
    setRoomForm({
      ...roomForm,
      room_type: roomTypeId,
      capacity: selectedType?.max_occupancy ?? roomForm.capacity,
      price_per_night: selectedType?.base_rate ?? roomForm.price_per_night,
    });
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    createRoom.mutate(roomForm as Omit<Room, 'id' | 'room_type_name' | 'room_type_details'>, {
      onSuccess: () => {
        setActiveForm(null);
        setRoomForm(emptyRoom);
      },
    });
  };

  const handleCreateRoomType = (e: React.FormEvent) => {
    e.preventDefault();
    createRoomType.mutate(roomTypeForm, {
      onSuccess: () => {
        setActiveForm(null);
        setRoomTypeForm(emptyRoomType);
      },
    });
  };

  if (isLoading) return <div className="p-6 text-slate-600">Loading rooms...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading rooms</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rooms Management</h1>
          <p className="mt-2 text-slate-600">Set up room types, room inventory, rates, and operational status.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveForm(activeForm === 'type' ? null : 'type')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {activeForm === 'type' ? 'Cancel' : 'Add Type'}
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'room' ? null : 'room')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {activeForm === 'room' ? 'Cancel' : 'Add Room'}
          </button>
        </div>
      </div>

      {activeForm === 'type' && (
        <form onSubmit={handleCreateRoomType} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Room Type</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Type Name"
              value={roomTypeForm.name}
              onChange={(e) => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="text"
              placeholder="Code"
              value={roomTypeForm.code}
              onChange={(e) => setRoomTypeForm({ ...roomTypeForm, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="number"
              placeholder="Base Occupancy"
              value={roomTypeForm.base_occupancy}
              onChange={(e) => setRoomTypeForm({ ...roomTypeForm, base_occupancy: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              min="1"
              required
            />
            <input
              type="number"
              placeholder="Max Occupancy"
              value={roomTypeForm.max_occupancy}
              onChange={(e) => setRoomTypeForm({ ...roomTypeForm, max_occupancy: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              min="1"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Base Rate"
              value={roomTypeForm.base_rate}
              onChange={(e) => setRoomTypeForm({ ...roomTypeForm, base_rate: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <textarea
              placeholder="Description"
              value={roomTypeForm.description}
              onChange={(e) => setRoomTypeForm({ ...roomTypeForm, description: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          {createRoomType.isError && <p className="mt-4 text-sm text-red-600">Could not create room type.</p>}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Type
          </button>
        </form>
      )}

      {activeForm === 'room' && (
        <form onSubmit={handleCreateRoom} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Room</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Room Number"
              value={roomForm.room_number}
              onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <select
              value={roomForm.room_type}
              onChange={(e) => handleRoomTypeChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="">{roomTypesLoading ? 'Loading room types...' : 'Select Room Type'}</option>
              {roomTypes?.map((roomType) => (
                <option key={roomType.id} value={roomType.id}>
                  {roomType.name} - {formatMoney(roomType.base_rate, settings?.currency)}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Capacity"
              value={roomForm.capacity}
              onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              min="1"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Price per Night"
              value={roomForm.price_per_night}
              onChange={(e) => setRoomForm({ ...roomForm, price_per_night: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <select
              value={roomForm.status}
              onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value as Room['status'] })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
              <option value="cleaning">Cleaning</option>
            </select>
            <textarea
              placeholder="Description"
              value={roomForm.description}
              onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          {createRoom.isError && <p className="mt-4 text-sm text-red-600">Could not create room.</p>}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Room
          </button>
        </form>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        {roomTypes?.map((roomType) => (
          <article key={roomType.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">{roomType.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{roomType.code}</p>
            <p className="mt-3 text-sm text-slate-700">
              Occupancy {roomType.base_occupancy}-{roomType.max_occupancy} | {formatMoney(roomType.base_rate, settings?.currency)}
            </p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rooms?.map((room) => (
          <article key={room.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Room {room.room_number}</h3>
                <p className="text-sm text-slate-500">{room.room_type_name}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  room.status === 'available'
                    ? 'bg-green-100 text-green-800'
                    : room.status === 'occupied'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {room.status}
              </span>
            </div>
            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p>Capacity: {room.capacity}</p>
              <p>Rate: {formatMoney(room.price_per_night, settings?.currency)}/night</p>
              {room.description && <p>{room.description}</p>}
            </div>
          </article>
        ))}
        {rooms?.length === 0 && <p className="text-slate-600">No rooms created yet.</p>}
      </section>
    </div>
  );
};

export default Rooms;
