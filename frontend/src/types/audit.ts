export interface AuditLog {
  id: string;
  actor?: string | null;
  actor_email: string;
  action: 'create' | 'update' | 'delete';
  module: string;
  object_type: string;
  object_id: string;
  object_repr: string;
  changes: Record<string, any>;
  metadata: {
    path?: string;
    method?: string;
    ip_address?: string;
  };
  created_at: string;
  updated_at: string;
  actor_details?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}
