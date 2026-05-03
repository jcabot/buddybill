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

type Mode = 'equal' | 'amount' | 'percent';

/**
 * Controlled split editor. When `value === null`, the split is implicit-equal
 * and shares are derived from `amount`. As soon as the user toggles to custom,
 * the parent receives a concrete map. Percent mode is local to this component:
 * users enter percentages and we propagate the equivalent amounts upward.
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

  const [percentMode, setPercentMode] = useState(false);
  const [percents, setPercents] = useState<Record<string, number>>({});
  const [percentDrafts, setPercentDrafts] = useState<Record<string, string>>({});

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isCustom) {
      setDrafts({});
      setPercentMode(false);
      setPercents({});
      setPercentDrafts({});
    }
  }, [isCustom]);

  // Compute amounts from percentages with deterministic rounding so that,
  // when percents sum to 100, amounts sum exactly to total.
  const amountsFromPercents = (pcts: Record<string, number>): Record<string, number> => {
    const totalMinor = toMinor(amount, currency);
    const exacts = members.map((m) => ((pcts[m.id] ?? 0) / 100) * totalMinor);
    const floored = exacts.map((e) => Math.floor(e));
    const sumPct = members.reduce((s, m) => s + (pcts[m.id] ?? 0), 0);
    const out: Record<string, number> = {};

    if (totalMinor === 0) {
      members.forEach((m) => (out[m.id] = 0));
      return out;
    }

    if (Math.abs(sumPct - 100) < 1e-6) {
      const sumFloored = floored.reduce((s, v) => s + v, 0);
      const residual = totalMinor - sumFloored;
      const indices = exacts
        .map((e, i) => ({ i, frac: e - floored[i] }))
        .sort((a, b) => b.frac - a.frac);
      const result = [...floored];
      for (let k = 0; k < residual && k < indices.length; k++) {
        result[indices[k].i]++;
      }
      members.forEach((m, i) => (out[m.id] = fromMinor(result[i], currency)));
    } else {
      members.forEach((m, i) => {
        out[m.id] = fromMinor(Math.round(exacts[i]), currency);
      });
    }
    return out;
  };

  // When amount changes externally and we're in percent mode, recompute amounts.
  useEffect(() => {
    if (!percentMode) return;
    onChange(amountsFromPercents(percents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, currency]);

  const percentSum = useMemo(
    () => members.reduce((s, m) => s + (percents[m.id] ?? 0), 0),
    [percents, members],
  );
  const percentDrift = Math.abs(percentSum - 100);

  const mode: Mode = !isCustom ? 'equal' : percentMode ? 'percent' : 'amount';

  const enterEqual = () => {
    setPercentMode(false);
    onChange(null);
  };
  const enterAmount = () => {
    setPercentMode(false);
    if (!isCustom) onChange({ ...equalShares });
  };
  const enterPercent = () => {
    const seed: Record<string, number> = {};
    if (amount > 0) {
      members.forEach((m) => {
        seed[m.id] = ((displayed[m.id] ?? 0) / amount) * 100;
      });
    } else {
      const equalPct = members.length > 0 ? 100 / members.length : 0;
      members.forEach((m) => (seed[m.id] = equalPct));
    }
    setPercents(seed);
    setPercentDrafts({});
    setPercentMode(true);
    onChange(amountsFromPercents(seed));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label !mb-0">Split</label>
        <div className="text-xs flex gap-3">
          <button
            type="button"
            className={`underline ${mode === 'equal' ? 'text-primary font-bold' : 'text-muted'}`}
            onClick={enterEqual}
          >
            Equal
          </button>
          <button
            type="button"
            className={`underline ${mode === 'percent' ? 'text-primary font-bold' : 'text-muted'}`}
            onClick={enterPercent}
          >
            %
          </button>
          <button
            type="button"
            className={`underline ${mode === 'amount' ? 'text-primary font-bold' : 'text-muted'}`}
            onClick={enterAmount}
          >
            Custom
          </button>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const v = displayed[m.id] ?? 0;
          const draft = drafts[m.id];
          const pctDraft = percentDrafts[m.id];
          const pct = percents[m.id] ?? 0;
          return (
            <li key={m.id} className="py-2 flex items-center justify-between gap-3">
              <span>{m.name}</span>
              {mode === 'percent' ? (
                <div className="flex items-center gap-2">
                  <input
                    className="input max-w-[5rem] text-right"
                    inputMode="decimal"
                    value={pctDraft ?? (Number.isFinite(pct) ? pct.toFixed(2) : '0')}
                    onChange={(e) => {
                      const txt = e.target.value;
                      setPercentDrafts((d) => ({ ...d, [m.id]: txt }));
                      const num = Number(txt.replace(',', '.'));
                      if (Number.isFinite(num) && num >= 0) {
                        const next = { ...percents, [m.id]: num };
                        setPercents(next);
                        onChange(amountsFromPercents(next));
                      }
                    }}
                    onBlur={() =>
                      setPercentDrafts((d) => {
                        const next = { ...d };
                        delete next[m.id];
                        return next;
                      })
                    }
                  />
                  <span className="text-muted text-sm">%</span>
                  <span className="tabular-nums text-muted text-sm w-20 text-right">
                    {formatMoney(v, currency)}
                  </span>
                </div>
              ) : mode === 'amount' ? (
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
      {mode === 'percent' ? (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Sum</span>
            <span className={percentDrift < 1e-6 ? 'text-muted' : 'text-danger'}>
              {percentSum.toFixed(2)}% / 100%
            </span>
          </div>
          {percentDrift >= 1e-6 && (
            <p className="text-xs text-danger">
              Percentages don't add up — {percentSum > 100 ? 'over' : 'under'} by{' '}
              {Math.abs(percentSum - 100).toFixed(2)}%.
            </p>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
