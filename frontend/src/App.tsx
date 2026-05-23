import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import TenantOnboarding from './pages/TenantOnboarding';
import Rooms from './pages/Rooms';
import Bookings from './pages/Bookings';
import Staff from './pages/Staff';
import Housekeeping from './pages/Housekeeping';
import Restaurant from './pages/Restaurant';
import POS from './pages/POS';
import Accounting from './pages/Accounting';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import HRMS from './pages/HRMS';
import Maintenance from './pages/Maintenance';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import Payments from './pages/Payments';

function App() {
  return (
    <div className="min-h-screen bg-[#edf7f1] text-slate-900">
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route element={<ProtectedRoute permissions={['users.staff.create']} />}>
              <Route path="/staff" element={<Staff />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['rooms.room.read', 'rooms.room.update']} />}>
              <Route path="/rooms" element={<Rooms />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['bookings.reservation.read', 'bookings.reservation.create']} />}>
              <Route path="/bookings" element={<Bookings />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['housekeeping.task.update']} />}>
              <Route path="/housekeeping" element={<Housekeeping />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['maintenance.ticket.update']} />}>
              <Route path="/maintenance" element={<Maintenance />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update']} />}>
              <Route path="/restaurant" element={<Restaurant />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['pos.sale.create']} />}>
              <Route path="/pos" element={<POS />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['payments.intent.read', 'payments.intent.create']} />}>
              <Route path="/payments" element={<Payments />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['accounting.ledger.read', 'accounting.journal.create']} />}>
              <Route path="/accounting" element={<Accounting />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['inventory.stock.read', 'inventory.purchase.create']} />}>
              <Route path="/inventory" element={<Inventory />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['reports.operational.read']} />}>
              <Route path="/reports" element={<Reports />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['hrms.employee.read', 'hrms.employee.create', 'hrms.attendance.read', 'hrms.payroll.read']} />}>
              <Route path="/hrms" element={<HRMS />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['audit.log.read']} />}>
              <Route path="/audit-logs" element={<AuditLogs />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['notifications.event.read', 'notifications.template.read']} />}>
              <Route path="/notifications" element={<Notifications />} />
            </Route>
            <Route element={<ProtectedRoute permissions={['platform.tenants.create']} />}>
              <Route path="/onboarding" element={<TenantOnboarding />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </div>
  );
}

export default App;
