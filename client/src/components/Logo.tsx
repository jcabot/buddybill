interface Props {
  size?: number;
}

export function Logo({ size = 28 }: Props) {
  return (
    <span className="inline-flex items-center gap-2 font-brand font-extrabold text-text">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="bs-logo" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        <rect rx="14" ry="14" width="64" height="64" fill="url(#bs-logo)" />
        <circle cx="24" cy="32" r="12" fill="var(--color-bg)" opacity="0.95" />
        <circle cx="40" cy="32" r="12" fill="var(--color-bg)" opacity="0.95" />
        <circle cx="32" cy="32" r="3" fill="var(--color-text)" />
      </svg>
      <span>
        Buddy<span className="text-primary">Split</span>
      </span>
    </span>
  );
}
