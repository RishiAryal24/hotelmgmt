
export default function Header() {
  return (
    <div className="bg-white rounded-3xl shadow-sm p-6 flex justify-between items-center">
      <div>
        <h2 className="text-3xl font-bold text-[#1F5E3B]">
          Welcome Back, Admin
        </h2>
        <p className="text-gray-500 mt-1">
          Luxury Hospitality Management Dashboard
        </p>
      </div>

      <div className="flex items-center gap-4">
        <input
          placeholder="Search reservations..."
          className="border rounded-2xl px-4 py-3 w-72"
        />

        <div className="w-12 h-12 rounded-full bg-[#1F5E3B] text-white flex items-center justify-center font-bold">
          A
        </div>
      </div>
    </div>
  )
}
