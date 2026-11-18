import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Leaf } from "lucide-react";

const NAV_ITEMS = [
  { name: "Queue", path: "/verifier/queue" },
  { name: "Leaderboard rules", path: "/verifier/leaderboard" },
  { name: "Badges", path: "/verifier/badges" },
  { name: "Certification checklist", path: "/verifier/checklist" },
  { name: "History", path: "/verifier/history" },
];

export default function DashboardLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-midnight text-white-text overflow-hidden font-sans selection:bg-electric-emerald/30">
      
      {/* SIDEBAR */}
      <aside className="w-56 bg-deep-forest border-r border-white/5 flex flex-col justify-between">
        <div>
          <div className="p-4 flex items-center gap-2 border-b border-white/5">
            <Leaf size={18} className="text-electric-emerald" />
            <div>
              <h1 className="font-bold tracking-wide text-xs">PROJECT ARROW</h1>
              <p className="text-[10px] text-soft-glass">Verification queue</p>
            </div>
          </div>

          <nav className="p-3 space-y-1 mt-2">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname.includes(item.path);
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`block w-full text-left px-3 py-2 rounded-md text-sm transition-all
                    ${isActive 
                      ? "bg-atmos-teal text-white-text font-medium" 
                      : "text-soft-glass hover:bg-white/5 hover:text-white-text"
                    }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-forest-shadow/20">
          <h2 className="text-sm font-semibold text-soft-glass">
            <span className="text-white-text">Project Arrow</span> — Verifier
          </h2>
          <div className="flex items-center gap-4 text-xs">
            <button className="hover:text-electric-emerald transition">? Help</button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
              <span className="text-soft-glass">Role:</span>
              <span className="text-electric-emerald font-medium">Verifier</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* The Page Content is injected here by React Router */}
          <Outlet /> 
        </div>
      </main>
    </div>
  );
}