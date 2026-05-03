import type { Currency } from './constants.js';

export interface User {
  id: string;
  email: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  currency: Currency;
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
}

export interface Activity {
  id: string;
  name: string;
  balanced: boolean;
}

export type Split = Record<string, number>;

export interface Invoice {
  id: string;
  date: string;
  concept: string;
  description: string;
  amount: number;
  payerId: string;
  balanced: boolean;
  split: Split;
}

export interface GroupMeta {
  id: string;
  name: string;
  ownerUserId: string;
  currency: Currency;
  createdAt: string;
  schemaVersion: number;
}

export interface GroupSnapshot {
  meta: GroupMeta;
  members: Member[];
  activities: Activity[];
  invoicesByActivity: Record<string, Invoice[]>;
}

export interface MemberBalance {
  memberId: string;
  memberName: string;
  paid: number;
  /**
   * What this member should contribute to cover the activity/group's invoices
   * (sum of their split shares). Whether they end up owing or being owed
   * depends on how much they paid versus this contribution — see `net`.
   */
  contribution: number;
  net: number;
}

export interface ActivityBalance {
  activityId: string;
  activityName: string;
  balanced: boolean;
  members: MemberBalance[];
}

export interface GroupBalance {
  groupId: string;
  currency: Currency;
  perActivity: ActivityBalance[];
  totals: MemberBalance[];
}
