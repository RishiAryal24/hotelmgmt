import { Room } from './bookings';

export interface MaintenanceTicket {
  id: string;
  room: string;
  room_details?: Room;
  title: string;
  description: string;
  category: 'plumbing' | 'electrical' | 'hvac' | 'furniture' | 'appliance' | 'safety' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'canceled';
  reported_by?: string | null;
  assigned_to?: string | null;
  due_at?: string | null;
  started_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
  reported_by_details?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  assigned_to_details?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}
