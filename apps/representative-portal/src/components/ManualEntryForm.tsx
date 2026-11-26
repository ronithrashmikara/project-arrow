import React, { useState } from 'react';
import {
  Gauge,
  Flame,
  Recycle,
  Shirt,
  Car,
  CheckCircle2,
  HardDriveDownload,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { addLedgerEntry, computeSha256 } from '../services/ledgerStore';

interface ManualEntryFormProps {
  isOnline: boolean;
  onSubmitted?: () => void;
}

type EntryCategory =
  | 'sub_meter_electricity'
  | 'sub_meter_water'
  | 'lpg_refill'
  | 'waste_haulage'
  | 'outsourced_laundry'
  | 'guest_transport';

interface CategoryMeta {
  id: EntryCategory;
  label: string;
  subLabel: string;
  scope: 'Scope 1' | 'Scope 2' | 'Scope 3';
  unit: string;
  icon: React.ElementType;
  placeholder: string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'sub_meter_electricity',
    label: 'Sub-Meter Electricity',
    subLabel: 'Generator / Wing Meter',
    scope: 'Scope 2',
    unit: 'kWh',
    icon: Gauge,
    placeholder: 'e.g. 425.5',
  },
  {
    id: 'sub_meter_water',
    label: 'Sub-Meter Water',
    subLabel: 'Borehole / Tank Meter',
    scope: 'Scope 3',
    unit: 'm³',
    icon: Gauge,
    placeholder: 'e.g. 38.0',
  },
  {
    id: 'lpg_refill',
    label: 'LPG Cylinder Refills',
    subLabel: '12.5 kg / 37.5 kg Kitchen',
    scope: 'Scope 1',
    unit: 'kg',
    icon: Flame,
    placeholder: 'Number of cylinders',
  },
  {
    id: 'waste_haulage',
    label: 'Waste Haulage',
    subLabel: 'Solid / Organic Waste',
    scope: 'Scope 3',
    unit: 'kg',
    icon: Recycle,
    placeholder: 'e.g. 180',
  },
  {
    id: 'outsourced_laundry',
    label: 'Outsourced Laundry',
    subLabel: 'Linen Weight Dispatched',
    scope: 'Scope 3',
    unit: 'kg',
    icon: Shirt,
    placeholder: 'e.g. 310',
  },
  {
    id: 'guest_transport',
    label: 'Guest Transport',
    subLabel: 'Safari / Airport Transfers',
    scope: 'Scope 3',
    unit: 'km',
    icon: Car,
    placeholder: 'e.g. 145',
  },
];

export const ManualEntryForm: React.FC<ManualEntryFormProps> = ({ isOnline, onSubmitted }) => {
  const [category, setCategory] = useState<EntryCategory>('sub_meter_electricity');
  const [activityDate, setActivityDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [quantity, setQuantity] = useState<string>('');
  const [cylinderSize, setCylinderSize] = useState<'12.5' | '37.5'>('37.5');
  const [cylinderCount, setCylinderCount] = useState<string>('1');
  const [referenceLabel, setReferenceLabel] = useState<string>('');
  const [submittedBy, setSubmittedBy] = useState<string>('Hotel Sustainability Rep');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    summary: string;
    hash: string;
    offline: boolean;
  } | null>(null);

  const selectedMeta = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];
  const isLpg = category === 'lpg_refill';

  const computedLpgKg = isLpg
    ? (parseFloat(cylinderCount) || 0) * parseFloat(cylinderSize)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    const finalNumeric = isLpg ? computedLpgKg : parseFloat(quantity);
    if (!finalNumeric || finalNumeric <= 0 || Number.isNaN(finalNumeric)) {
      setError(
        isLpg
          ? 'Please enter a valid number of LPG cylinders (at least 1).'
          : `Please enter a valid positive value in ${selectedMeta.unit}.`,
      );
      return;
    }

    if (!submittedBy.trim()) {
      setError('Please enter your name or staff ID.');
      return;
    }

    setSubmitting(true);

    try {
      const timestamp = new Date().toISOString();
      const payload = {
        category,
        scope: selectedMeta.scope,
        quantity: finalNumeric,
        unit: selectedMeta.unit,
        activityDate,
        referenceLabel: isLpg
          ? `${cylinderCount} × ${cylinderSize}kg cylinders`
          : referenceLabel.trim() || selectedMeta.label,
        notes: notes.trim(),
        submittedBy: submittedBy.trim(),
        timestamp,
      };

      const evidenceHash = await computeSha256(JSON.stringify(payload));
      const summaryValue = isLpg
        ? `${finalNumeric.toLocaleString()} kg (${cylinderCount} × ${cylinderSize}kg)`
        : `${finalNumeric.toLocaleString()} ${selectedMeta.unit}`;

      addLedgerEntry({
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: 'manual_entry',
        category: selectedMeta.label,
        scope: selectedMeta.scope,
        summaryValue,
        numericValue: finalNumeric,
        unit: selectedMeta.unit,
        periodOrDate: activityDate,
        accountOrRef: payload.referenceLabel,
        submittedBy: submittedBy.trim(),
        timestamp,
        evidenceHash,
        syncStatus: isOnline ? 'synced' : 'queued_offline',
        details: payload,
      });

      setSuccessInfo({
        summary: `${selectedMeta.label}: ${summaryValue}`,
        hash: evidenceHash,
        offline: !isOnline,
      });

      setQuantity('');
      setCylinderCount('1');
      setReferenceLabel('');
      setNotes('');
      onSubmitted?.();
    } catch (err: any) {
      setError(err?.message || 'Unable to save entry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-brand-forest-deep border border-brand-teal-mountain/40 rounded-2xl p-6 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-brand-teal-mountain/30 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-emerald-electric shadow-glow-emerald" />
            <h2 className="text-xl font-semibold text-brand-white tracking-wide">
              Manual & Scope 3 Activity Entry
            </h2>
          </div>
          <p className="text-xs text-brand-seaglass/70 mt-1">
            Record sub-meter readings, LPG cylinder refills, waste haulage, outsourced laundry, and guest transport.
          </p>
        </div>

        <span
          className={`self-start sm:self-auto px-3 py-1 rounded-full text-xs font-semibold border ${
            selectedMeta.scope === 'Scope 1'
              ? 'bg-brand-gold-sunset/15 border-brand-gold-sunset/40 text-brand-gold-sunset'
              : selectedMeta.scope === 'Scope 2'
                ? 'bg-brand-emerald-electric/15 border-brand-emerald-electric/40 text-brand-emerald-mint'
                : 'bg-brand-teal-atmospheric/70 border-brand-teal-mountain text-brand-seaglass'
          }`}
        >
          {selectedMeta.scope}
        </span>
      </div>

      {/* Category Selector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map((item) => {
          const Icon = item.icon;
          const active = item.id === category;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCategory(item.id);
                setError(null);
                setSuccessInfo(null);
              }}
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                active
                  ? 'bg-brand-teal-atmospheric/90 border-brand-emerald-electric/70 text-brand-white shadow-glow-emerald/20'
                  : 'bg-brand-forest-shadow/60 border-brand-teal-mountain/30 text-brand-seaglass/80 hover:border-brand-teal-misty hover:text-brand-white'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  active
                    ? 'bg-brand-emerald-electric/20 text-brand-emerald-electric'
                    : 'bg-brand-midnight/60 text-brand-seaglass/60'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{item.label}</div>
                <div className="text-[11px] text-brand-seaglass/60 mt-0.5">{item.subLabel}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Entry Form */}
      <form onSubmit={handleSubmit} className="space-y-5 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-brand-seaglass mb-1.5">
              Activity / Reading Date
            </label>
            <input
              type="date"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-sm text-brand-white focus:outline-none focus:border-brand-emerald-electric"
            />
          </div>

          {/* Quantity or LPG Cylinder Calculator */}
          {isLpg ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-brand-seaglass mb-1.5">
                  Cylinder Size
                </label>
                <select
                  value={cylinderSize}
                  onChange={(e) => setCylinderSize(e.target.value as '12.5' | '37.5')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-sm text-brand-white focus:outline-none focus:border-brand-emerald-electric"
                >
                  <option value="12.5">12.5 kg (Domestic)</option>
                  <option value="37.5">37.5 kg (Commercial)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-seaglass mb-1.5">
                  Cylinders Refilled
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cylinderCount}
                  onChange={(e) => setCylinderCount(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-sm text-brand-white focus:outline-none focus:border-brand-emerald-electric"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-brand-seaglass mb-1.5">
                Quantity ({selectedMeta.unit})
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={selectedMeta.placeholder}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 pr-14 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-sm text-brand-white placeholder:text-brand-seaglass/40 focus:outline-none focus:border-brand-emerald-electric"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-emerald-mint">
                  {selectedMeta.unit}
                </span>
              </div>
            </div>
          )}

          {/* Reference / Meter Name */}
          <div>
            <label className="block text-xs font-medium text-brand-seaglass mb-1.5">
              Meter / Vendor / Route Reference
            </label>
            <input
              type="text"
              placeholder={
                isLpg
                  ? 'e.g. Main Kitchen Litro Batch'
                  : 'e.g. Kitchen Wing Meter / Contractor Name'
              }
              value={referenceLabel}
              onChange={(e) => setReferenceLabel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-sm text-brand-white placeholder:text-brand-seaglass/40 focus:outline-none focus:border-brand-emerald-electric"
            />
          </div>

          {/* Staff Member */}
          <div>
            <label className="block text-xs font-medium text-brand-seaglass mb-1.5">
              Recorded By (Staff Name / ID)
            </label>
            <input
              type="text"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-sm text-brand-white focus:outline-none focus:border-brand-emerald-electric"
            />
          </div>
        </div>

        {/* LPG Total Preview */}
        {isLpg && (
          <div className="p-3.5 rounded-xl bg-brand-forest-shadow/70 border border-brand-teal-mountain/40 flex items-center justify-between text-xs">
            <span className="text-brand-seaglass">Calculated Total LPG Weight:</span>
            <span className="text-brand-emerald-mint font-bold text-sm">
              {computedLpgKg.toLocaleString()} kg
            </span>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-brand-seaglass mb-1.5">
            Notes (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="Any shift handover notes or meter remarks..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-sm text-brand-white placeholder:text-brand-seaglass/40 focus:outline-none focus:border-brand-emerald-electric"
          />
        </div>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="p-3 rounded-xl bg-brand-gold-sunset/10 border border-brand-gold-sunset/40 text-brand-gold-sunset text-xs flex items-center gap-2">
            <HardDriveDownload className="w-4 h-4 flex-shrink-0" />
            <span>
              You are currently offline. This entry will be saved locally and synced automatically once connectivity returns.
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-brand-copper-warm/15 border border-brand-copper-warm/40 text-brand-gold-sunset text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successInfo && (
          <div className="p-3.5 rounded-xl bg-brand-emerald-fresh/10 border border-brand-emerald-fresh/40 text-brand-emerald-mint text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-brand-emerald-electric" />
              <span>
                {successInfo.offline
                  ? 'Saved offline — queued for sync: '
                  : 'Submitted to Confirmed Ledger: '}
                {successInfo.summary}
              </span>
            </div>
            <div className="text-[11px] text-brand-seaglass/70 font-mono truncate">
              Evidence Hash: {successInfo.hash}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-emerald-electric text-brand-midnight text-xs font-bold tracking-wide hover:bg-brand-emerald-fresh transition-all shadow-glow-emerald disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Entry...</span>
              </>
            ) : isOnline ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Submit to Confirmed Ledger</span>
              </>
            ) : (
              <>
                <HardDriveDownload className="w-4 h-4" />
                <span>Save Offline</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
