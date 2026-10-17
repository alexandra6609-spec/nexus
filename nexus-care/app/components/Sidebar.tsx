import {
  Activity,
  LayoutDashboard,
  Network,
  Package,
  Radio,
  SearchAlert,
  Settings,
  Stethoscope,
  Users,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

export type ViewId =
  | "overview"
  | "patients"
  | "triage"
  | "network"
  | "inventory"
  | "sync"
  | "disease-scanner"
  | "settings";

export const NAV_ITEMS: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "patients", label: "Patients", icon: Users },
  { id: "triage", label: "Triage", icon: Stethoscope },
  { id: "network", label: "Clinic Network", icon: Network },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "sync", label: "Sync Status", icon: Radio },
  { id: "disease-scanner", label: "Disease Scanner", icon: SearchAlert },
  { id: "settings", label: "Settings", icon: Settings },
];

type Props = {
  active: ViewId;
  onSelect: (view: ViewId) => void;
  pendingCount: number;
};

export default function Sidebar({ active, onSelect, pendingCount }: Props) {
  return (
    <aside className="flex w-full shrink-0 flex-col bg-[#101B35] text-white lg:sticky lg:top-0 lg:h-screen lg:w-60">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
          <Activity size={23} />
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight">Nexus Care</p>
          <p className="text-xs text-slate-300">Clinic Coordination</p>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelect(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${
                isActive
                  ? "bg-teal-700 text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.id === "sync" && pendingCount > 0 && (
                <span className="ml-auto rounded-full bg-amber-400 px-1.5 text-xs font-bold text-[#101B35]">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 p-4 lg:block">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <WifiOff size={17} className="text-amber-400" />
          <span>Works offline</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Changes save on this device first and send when a link is
          available.
        </p>
      </div>
    </aside>
  );
}
