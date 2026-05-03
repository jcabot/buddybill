import { useEffect, useMemo, useState } from 'react';
import {
  type Currency,
  type Member,
  equalSplitMinor,
  formatMoney,
  fromMinor,
  minorPlaces,
  toMinor,
} from '@buddysplit/shared';

interface Props {
  members: Member[];
  amount: number;
  currency: Currency;
  value: Record<string, number> | null; // null = equal split
  onChange: (next: Record<string, number> | null) => void;
}

/**
 * Controlled split editor. When `value === null`, the split is implicit-equal
 * and shares are derived from `amount`. As soon as the user toggles to custom,
 * the parent receives a concrete map.
 */
export function SplitEditor({ members, amount, currency, value, onChange }: Props) {
  const isCustom = value !== null;
  const places = minorPlaces(currency);

  const equalShares = useMemo(() => {
    if (members.length === 0) return {} as Record<string, number>;
    const totalMinor = toMinor(amount, currency);
    const shares = equalSplitMinor(totalMinor, members.length);
    const out: Record<string, number> = {};
    members.forEach((m, i) => {
      out[m.id] = fromMinor(shares[i] ?? 0, currency);
    });
    return out;
  }, [members, amount, currency]);

  const displayed: Record<string, number> = isCustom ? value : equalShares;

  const totalShown = useMemo(
    () => Object.values(displayed).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0),
    [displayed],
  );
  const drift = totalShown - amount;
  const driftMinor = Math.abs(toMinor(totalShown, currency) - toMinor(amount, currency));

  // Local string state so users can type "12." without it snapping
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isCustom) setDrafts({});
  }, [isCustom]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label !mb-0">Split</label>
        <div className="text-xs flex gap-3">
          <button
            type="button"
            className={`underline ${!isCustom ? 'text-primary font-bold' : 'text-muted'}`}
            onClick={() => onChange(null)}
          >
            Equal
          </button>
          <button
            type="button"
            className={`underline ${isCustom ? 'text-primary font-bold' : 'text-muted'}`}
            onClick={() => onChange({ ...equalShares })}
          >
            Custom
          </button>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const v = displayed[m.id] ?? 0;
          const draft = drafts[m.id];
          return (
            <li key={m.id} className="py-2 flex items-center justify-between gap-3">
              <span>{m.name}</span>
              {isCustom ? (
                <input
                  className="input max-w-[8rem] text-right"
                  inputMode="decimal"
                  value={draft ?? v.toFixed(places)}
                  onChange={(e) => {
                    const txt = e.target.value;
                    setDrafts((d) => ({ ...d, [m.id]: txt }));
                    const num = Number(txt.replace(',', '.'));
                    if (Number.isFinite(num) && num >= 0) {
                      onChange({ ...(value ?? {}), [m.id]: num });
                    }
                  }}
                  onBlur={() => setDrafts((d) => {
                    const next = { ...d };
                    delete next[m.id];
                    return next;
                  })}
                />
              ) : (
                <span className="tabular-nums">{formatMoney(v, currency)}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex justify-between text-sm">
        <span className="text-muted">Sum</span>
        <span className={driftMinor === 0 ? 'text-muted' : 'text-danger'}>
          {formatMoney(totalShown, currency)} / {formatMoney(amount, currency)}
        </span>
      </div>
      {driftMinor > 0 && (
        <p className="text-xs text-danger">
          That split doesn't quite add up — {drift > 0 ? 'over' : 'under'} by{' '}
          {formatMoney(Math.abs(drift), currency)}.
        </p>
      )}
    </div>
  );
}
