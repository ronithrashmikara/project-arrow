import React, { useState } from "react";
import { Check, RotateCcw, AlertTriangle, FileText } from "lucide-react";

const SUBMISSIONS = [
  { 
    id: "GH-4821", property: "Kandy", month: "August 2026", completeness: 92, flags: 1, status: "Pending",
    items: [
      { name: "Electricity", entered: "2,340 kWh", lastAug: "2,180", evidence: "bill.jpg" },
      { name: "Diesel", entered: "3,000 L", lastAug: "500", evidence: "—", flagged: true },
      { name: "LPG", entered: "6 × 12.5 kg", lastAug: "5 × 12.5", evidence: "receipt" },
      { name: "Water", entered: "212 m³", lastAug: "198", evidence: "NWSDB" },
    ]
  },
  { 
    id: "HT-1170", property: "Galle", month: "August 2026", completeness: 100, flags: 0, status: "Pending",
    items: [{ name: "Electricity", entered: "1,200 kWh", lastAug: "1,150", evidence: "bill.jpg" }]
  },
  { 
    id: "HS-0932", property: "Ella", month: "July 2026", completeness: 74, flags: 2, status: "Flagged",
    items: [{ name: "Diesel", entered: "800 L", lastAug: "200", evidence: "—", flagged: true }]
  },
  { 
    id: "BV-2203", property: "Bentota", month: "August 2026", completeness: 88, flags: 0, status: "Pending",
    items: [{ name: "Water", entered: "300 m³", lastAug: "280", evidence: "NWSDB" }]
  },
];

const STATUS_STYLE = {
  Pending: "text-sunset-gold bg-sunset-gold/10 border-sunset-gold/20",
  Flagged: "text-warm-copper bg-warm-copper/10 border-warm-copper/20",
  Approved: "text-electric-emerald bg-electric-emerald/10 border-electric-emerald/20",
};

export default function VerifierDashboard() {
  const [selected, setSelected] = useState(SUBMISSIONS[0]);
  const [comment, setComment] = useState("Please confirm the diesel figure or upload the receipt");

  return (
    <>
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-lg font-semibold text-white-text">Submissions to review ({SUBMISSIONS.length})</h3>
        <div className="flex gap-2">
          <select className="bg-midnight border border-white/10 rounded-md px-3 py-1.5 text-xs text-soft-glass focus:outline-none focus:border-electric-emerald">
            <option>District: All</option>
            <option>Kandy</option>
            <option>Galle</option>
          </select>
          <select className="bg-midnight border border-white/10 rounded-md px-3 py-1.5 text-xs text-soft-glass focus:outline-none focus:border-electric-emerald">
            <option>Category: All</option>
            <option>Resort</option>
            <option>Boutique</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 items-start">
        
        {/* LEFT: Table Area */}
        <div className="col-span-5 glass-panel rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] text-soft-glass uppercase tracking-wider border-b border-white/10 bg-forest-shadow/50">
              <tr>
                <th className="p-3 font-medium">Property</th>
                <th className="p-3 font-medium">Month</th>
                <th className="p-3 font-medium">Completeness</th>
                <th className="p-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {SUBMISSIONS.map((sub) => (
                <tr 
                  key={sub.id}
                  onClick={() => setSelected(sub)}
                  className={`border-b border-white/5 cursor-pointer transition-colors text-xs
                    ${selected.id === sub.id ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <td className="p-3">
                    <span className="text-soft-glass mr-1">{sub.id}</span> 
                    <span className="font-medium text-white-text">{sub.property}</span>
                  </td>
                  <td className="p-3 text-soft-glass">{sub.month.replace(" 2026", "")}</td>
                  <td className="p-3 text-soft-glass">{sub.completeness}%</td>
                  <td className="p-3">
                    {sub.flags > 0 ? (
                      <span className="text-warm-copper flex items-center gap-1">
                        <AlertTriangle size={12} /> {sub.flags}
                      </span>
                    ) : (
                      <span className="text-soft-glass">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* RIGHT: Detail Panel */}
        <div className="col-span-7 glass-panel rounded-xl flex flex-col">
          
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-forest-shadow/30">
            <h3 className="font-semibold text-sm">
              <span className="text-electric-emerald mr-2">{selected.id}</span> 
              {selected.property} · {selected.month}
            </h3>
            <span className={`px-2.5 py-1 rounded-full text-[10px] border ${STATUS_STYLE[selected.status] || STATUS_STYLE.Pending}`}>
              {selected.status}
            </span>
          </div>

          <div className="p-4 flex-1">
            <table className="w-full text-left text-sm mb-4">
              <thead className="text-[11px] text-soft-glass uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 font-medium">Entered</th>
                  <th className="py-2 font-medium">Last Aug</th>
                  <th className="py-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-white/5 text-xs">
                    <td className="py-2.5 text-soft-glass">{item.name}</td>
                    <td className={`py-2.5 ${item.flagged ? "text-warm-copper font-semibold" : "text-white-text"}`}>
                      {item.entered}
                    </td>
                    <td className="py-2.5 text-soft-glass">{item.lastAug}</td>
                    <td className="py-2.5 text-soft-glass flex items-center gap-1">
                      {item.evidence !== "—" ? (
                        <><FileText size={12} className="text-electric-emerald"/> {item.evidence}</>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="w-full h-32 bg-midnight/40 border border-dashed border-white/10 rounded-lg flex items-center justify-center text-xs text-soft-glass">
              [ bill photo viewer ]
            </div>
          </div>

          <div className="p-4 border-t border-white/10 bg-forest-shadow/20 space-y-4">
            <div>
              <label className="text-[11px] text-soft-glass mb-1 block">Comment to property</label>
              <input 
                type="text" 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full bg-midnight border border-white/10 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-electric-emerald text-white-text"
              />
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-electric-emerald text-midnight font-bold text-xs hover:bg-luminous-mint transition">
                <Check size={14} /> Approve
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-md border border-white/20 text-xs font-medium hover:bg-white/5 transition">
                <RotateCcw size={14} /> Return for correction
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}