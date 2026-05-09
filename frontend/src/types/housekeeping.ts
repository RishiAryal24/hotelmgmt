import { Room } from './bookings';
import { AuthUser } from '../services/auth';

export interface HousekeepingTask {
  id: string;
  room: string;
  room_details?: Room;
  task_type: 'checkout_clean' | 'stayover_clean' | 'deep_clean' | 'inspection' | 'maintenance_escalation';
  status: 'open' | 'in_progress' | 'done' | 'blocked';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to: string | null;
  assigned_to_details?: AuthUser | null;
  notes: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

