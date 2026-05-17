import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: rooms, isLoading, error } = useRooms();
  const { data: roomTypes, isLoading: roomTypesLoading } = useRoomTypes();
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const createRoom = useCreateRoom();
  const createRoomType = useCreateRoomType();
  const [activeTab, setActiveTab] = useState('rooms');
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [isCreateTypeOpen, setIsCreateTypeOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Room['status'] | 'all'>(
    (searchParams.get('status') as Room['status'] | null) || 'all',
  );
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
        setRoomForm(emptyRoom);
        setIsCreateRoomOpen(false);
      },
    });
  };

  const handleCreateRoomType = (e: React.FormEvent) => {
    e.preventDefault();
    createRoomType.mutate(roomTypeForm, {
      onSuccess: () => {
        setRoomTypeForm(emptyRoomType);
        setIsCreateTypeOpen(false);
      },
    });
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === 'create-room') {
      setIsCreateRoomOpen(true);
      return;
    }
    if (tabId === 'create-type') {
      setIsCreateTypeOpen(true);
      return;
    }
    setActiveTab(tabId);
  };

  if (isLoading) return <div className="p-6 text-slate-600">Loading rooms...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading rooms</div>;

  const tabs = [
    { id: 'rooms', label: 'Rooms', count: rooms?.length || 0 },
    { id: 'types', label: 'Room Types', count: roomTypes?.length || 0 },
    { id: 'create-room', label: 'Add Room' },
    { id: 'create-type', label: 'Add Type' },
  ];
  const roomStatusCounts = {
    available: rooms?.filter((room) => room.status === 'available').length || 0,
    occupied: rooms?.filter((room) => room.status === 'occupied').length || 0,
    cleaning: rooms?.filter((room) => room.status === 'cleaning').length || 0,
    maintenance: rooms?.filter((room) => room.status === 'maintenance').length || 0,
  };
  const filteredRooms = statusFilter === 'all' ? rooms || [] : rooms?.filter((room) => room.status === statusFilter) || [];

  const handleStatusFilter = (status: Room['status'] | 'all') => {
    setStatusFilter(status);
    const nextParams = new URLSearchParams(searchParams);
    if (status === 'all') {
      nextParams.delete('status');
    } else {
      nextParams.set('status', status);
    }
    setSearchParams(nextParams);
    setActiveTab('rooms');
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Rooms Management</h1>
            <p className="mt-1 text-sm text-slate-500">Room inventory, rates, status, and room type setup in compact rows.</p>
          </div>
          <CompactTabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {Object.entries(roomStatusCounts).map(([status, count]) => (
          <button
            key={status}
            type="button"
            onClick={() => handleStatusFilter(status as Room['status'])}
            className={`rounded-3xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              statusFilter === status ? 'ring-2 ring-emerald-500' : ''
            }`}
          >
            <p className="text-sm capitalize text-slate-500">{status}</p>
            <p className="mt-2 text-2xl font-bold text-[#1F5E3B]">{count}</p>
          </button>
        ))}
      </section>

      {activeTab === 'rooms' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {statusFilter === 'all' ? 'All rooms' : `${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} rooms`}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{filteredRooms.length} matching room(s)</p>
            </div>
            {statusFilter !== 'all' && (
              <button type="button" onClick={() => handleStatusFilter('all')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Show all
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr><th className="py-3 pr-4">Room</th><th className="py-3 pr-4">Type</th><th className="py-3 pr-4">Capacity</th><th className="py-3 pr-4">Rate</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Description</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRooms.map((room) => (
                  <tr key={room.id}>
                    <td className="py-3 pr-4 font-medium text-slate-900">Room {room.room_number}</td>
                    <td className="py-3 pr-4">{room.room_type_name}</td>
                    <td className="py-3 pr-4">{room.capacity}</td>
                    <td className="py-3 pr-4">{formatMoney(room.price_per_night, settings?.currency)}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${room.status === 'available' ? 'bg-emerald-50 text-emerald-700' : room.status === 'occupied' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{room.status}</span>
                    </td>
                    <td className="max-w-xs truncate py-3 pr-4 text-slate-500">{room.description || '-'}</td>
                  </tr>
                ))}
                {filteredRooms.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No matching rooms.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'types' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr><th className="py-3 pr-4">Type</th><th className="py-3 pr-4">Code</th><th className="py-3 pr-4">Occupancy</th><th className="py-3 pr-4">Base Rate</th><th className="py-3 pr-4">Active</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roomTypes?.map((roomType) => (
                  <tr key={roomType.id}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{roomType.name}</td>
                    <td className="py-3 pr-4">{roomType.code}</td>
                    <td className="py-3 pr-4">{roomType.base_occupancy}-{roomType.max_occupancy}</td>
                    <td className="py-3 pr-4">{formatMoney(roomType.base_rate, settings?.currency)}</td>
                    <td className="py-3 pr-4">{roomType.is_active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {roomTypes?.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No room types yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isCreateRoomOpen && (
        <ActionModal title="Create room" onClose={() => setIsCreateRoomOpen(false)}>
          <form onSubmit={handleCreateRoom}>
            <div className="grid gap-3 md:grid-cols-2">
          <input placeholder="Room Number" value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <select value={roomForm.room_type} onChange={(e) => handleRoomTypeChange(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
            <option value="">{roomTypesLoading ? 'Loading room types...' : 'Select Room Type'}</option>
            {roomTypes?.map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.name} - {formatMoney(roomType.base_rate, settings?.currency)}</option>)}
          </select>
          <input type="number" placeholder="Capacity" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" min="1" required />
          <input type="number" step="0.01" placeholder="Price per Night" value={roomForm.price_per_night} onChange={(e) => setRoomForm({ ...roomForm, price_per_night: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <select value={roomForm.status} onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value as Room['status'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="available">Available</option><option value="occupied">Occupied</option><option value="maintenance">Maintenance</option><option value="cleaning">Cleaning</option>
          </select>
          <textarea placeholder="Description" value={roomForm.description} onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsCreateRoomOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createRoom.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save room
              </button>
            </div>
          </form>
        </ActionModal>
      )}

      {isCreateTypeOpen && (
        <ActionModal title="Create room type" onClose={() => setIsCreateTypeOpen(false)}>
          <form onSubmit={handleCreateRoomType}>
            <div className="grid gap-3 md:grid-cols-2">
          <input placeholder="Type Name" value={roomTypeForm.name} onChange={(e) => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <input placeholder="Code" value={roomTypeForm.code} onChange={(e) => setRoomTypeForm({ ...roomTypeForm, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <input type="number" placeholder="Base Occupancy" value={roomTypeForm.base_occupancy} onChange={(e) => setRoomTypeForm({ ...roomTypeForm, base_occupancy: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" min="1" required />
          <input type="number" placeholder="Max Occupancy" value={roomTypeForm.max_occupancy} onChange={(e) => setRoomTypeForm({ ...roomTypeForm, max_occupancy: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" min="1" required />
          <input type="number" step="0.01" placeholder="Base Rate" value={roomTypeForm.base_rate} onChange={(e) => setRoomTypeForm({ ...roomTypeForm, base_rate: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <textarea placeholder="Description" value={roomTypeForm.description} onChange={(e) => setRoomTypeForm({ ...roomTypeForm, description: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsCreateTypeOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createRoomType.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save room type
              </button>
            </div>
          </form>
        </ActionModal>
      )}
    </div>
  );
};

const FormPanel = ({ title, onSubmit, children }: { title: string; onSubmit: (e: React.FormEvent) => void; children: React.ReactNode }) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <form onSubmit={onSubmit}>
      <h2 className="font-bold text-slate-900">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>
      <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Save</button>
    </form>
  </section>
);

export default Rooms;
