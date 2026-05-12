
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import KpiCard from '../components/KpiCard'

export default function Home() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 p-6 space-y-6">
        <Header />

        <div
          className="rounded-[30px] p-10 text-white"
          style={{
            backgroundImage:
              "linear-gradient(rgba(31,94,59,0.88), rgba(54,120,82,0.75)), url('https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1600&auto=format&fit=crop')",
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <h1 className="text-5xl font-bold">
            Premium Hotel Management Platform
          </h1>

          <p className="mt-4 text-xl max-w-3xl">
            Smart hospitality operations with reservations, housekeeping,
            guest management, analytics, and luxury enterprise workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <KpiCard
            title="Occupancy Rate"
            value="86%"
            subtitle="+12%"
          />

          <KpiCard
            title="New Reservations"
            value="126"
            subtitle="+8%"
          />

          <KpiCard
            title="Revenue"
            value="$54,200"
            subtitle="+18%"
          />

          <KpiCard
            title="Available Rooms"
            value="48"
            subtitle="Live"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-5 text-[#1F5E3B]">
              Recent Reservations
            </h2>

            <div className="space-y-4">
              {[
                'John Carter - Suite 205',
                'Emma Watson - Deluxe 104',
                'David Lee - Executive 309',
                'Sophia Brown - Suite 401'
              ].map((item, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-2xl flex justify-between"
                >
                  <span>{item}</span>
                  <span className="text-green-600">Confirmed</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-5 text-[#1F5E3B]">
              Housekeeping Status
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold">Clean Rooms</h3>
                <p className="text-4xl font-bold mt-3 text-[#1F5E3B]">84</p>
              </div>

              <div className="bg-yellow-50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold">Cleaning</h3>
                <p className="text-4xl font-bold mt-3 text-yellow-600">12</p>
              </div>

              <div className="bg-red-50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold">Maintenance</h3>
                <p className="text-4xl font-bold mt-3 text-red-600">4</p>
              </div>

              <div className="bg-emerald-50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold">VIP Guests</h3>
                <p className="text-4xl font-bold mt-3 text-emerald-700">16</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
