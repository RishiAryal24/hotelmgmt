
export default function KpiCard({ title, value, subtitle }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm p-6">
      <h3 className="text-gray-500">{title}</h3>

      <div className="mt-4 flex items-end justify-between">
        <p className="text-4xl font-bold text-[#1F5E3B]">{value}</p>
        <span className="text-green-600">{subtitle}</span>
      </div>
    </div>
  )
}
