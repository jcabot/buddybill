import clsx from 'clsx';
import { formatMoney, type Currency } from '@buddysplit/shared';

interface Props {
  amount: number;
  currency: Currency;
  signed?: boolean;
  className?: string;
}

export function Money({ amount, currency, signed, className }: Props) {
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
  return (
    <span className={clsx('tabular-nums font-semibold', tone, className)}>
      {prefix}
      {formatted}
    </span>
  );
}
