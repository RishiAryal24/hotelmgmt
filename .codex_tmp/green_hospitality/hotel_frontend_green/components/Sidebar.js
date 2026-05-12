
import {
  LayoutDashboard,
  BedDouble,
  Users,
  CalendarCheck,
  ClipboardList,
  Settings
} from 'lucide-react'

export default function Sidebar() {
  const menu = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Reservations', icon: CalendarCheck },
    { name: 'Guests', icon: Users },
    { name: 'Rooms', icon: BedDouble },
    { name: 'Reports', icon: ClipboardList }
  ]

  return (
    <div className="w-72 bg-[#1F5E3B] text-white min-h-screen p-6">
      <div className="mb-10">
        <h1 className="text-3xl font-bold">GreenStay ERP</h1>
        <p className="text-green-100 mt-1">Luxury Hospitality Platform</p>
      </div>

      <div className="space-y-3">
        {menu.map((item, index) => {
          const Icon = item.icon
          return (
            <div
              key={index}
              className="flex items-center gap-3 p-4 rounded-2xl hover:bg-[#2B7A4B] transition cursor-pointer"
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </div>
          )
        })}
      </div>

      <div className="absolute bottom-10 left-6 right-6">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#2B7A4B]">
          <Settings size={20} />
          <span>Settings</span>
        </div>
      </div>
    </div>
  )
}
