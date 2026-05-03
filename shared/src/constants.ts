export const SCHEMA_VERSION = 1;

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'EUR';

export const SHEET_META = 'Meta';
export const SHEET_MEMBERS = 'Members';
export const SHEET_ACTIVITIES = 'Activities';
