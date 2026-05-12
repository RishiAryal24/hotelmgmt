interface CompactTab {
  id: string;
  label: string;
  count?: number | string;
}

interface CompactTabsProps {
  tabs: CompactTab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

const CompactTabs = ({ tabs, activeTab, onChange }: CompactTabsProps) => (
  <div className="flex overflow-x-auto rounded-2xl bg-emerald-50 p-1 text-sm">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 font-medium transition ${
          activeTab === tab.id ? 'bg-white text-[#1F5E3B] shadow-sm' : 'text-emerald-700 hover:text-[#1F5E3B]'
        }`}
      >
        <span>{tab.label}</span>
        {tab.count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tab.count}</span>}
      </button>
    ))}
  </div>
);

export default CompactTabs;
