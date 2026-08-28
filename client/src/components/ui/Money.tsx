import clsx from 'clsx';
import { formatMoney, type Currency } from '@buddysplit/shared';

interface Props {
  amount: number;
  currency: Currency;
  signed?: boolean;
  memberName?: string;
  className?: string;
}

function signedBalanceHint(amount: number, memberName?: string): string | null {
  const who = memberName?.trim() || 'This person';
  if (amount > 0.0001) return `${who} overpaid and is owed this amount`;
  if (amount < -0.0001) return `${who} still needs to pay this amount`;
  return null;
}

export function Money({ amount, currency, signed, memberName, className }: Props) {
  const formatted = formatMoney(Math.abs(amount), currency);
  let prefix = '';
  let tone = '';
  if (signed) {
    if (amount > 0.0001) {
      prefix = '+';
      tone = 'text-success';
    } else if (amount < -0.0001) {
      prefix = '-';
      tone = 'text-danger';
    } else {
      tone = 'text-muted';
    }
  }
  const hint = signed ? signedBalanceHint(amount, memberName) : null;

  return (
    <span
      className={clsx(
        'tabular-nums font-semibold',
        tone,
        hint && 'group relative inline-flex cursor-help',
        className,
      )}
      aria-label={hint ?? undefined}
    >
      {prefix}
      {formatted}
      {hint && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[calc(100%+6px)] right-0 z-20 w-max max-w-[14rem] rounded-md bg-text px-2 py-1 text-left text-xs font-semibold text-bg opacity-0 shadow-card transition-opacity group-hover:opacity-100"
        >
          {hint}
        </span>
      )}
    </span>
  );
}
