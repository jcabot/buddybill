import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Activity,
  ActivityBalance,
  ActivityListItem,
  Currency,
  GroupBalance,
  Invoice,
  Member,
} from '@buddysplit/shared';
import { api } from './client.js';

export interface MeUser {
  id: string;
  email: string;
}

export interface GroupListEntry {
  id: string;
  name: string;
  currency: Currency;
  createdAt: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  currency: Currency;
  createdAt: string;
  members: Member[];
  activities: ActivityListItem[];
}

export interface ActivityDetailPayload {
  activity: Activity;
  invoices: Invoice[];
  balance: ActivityBalance;
  members: Member[];
  currency: Currency;
}

export const queryKeys = {
  me: ['me'] as const,
  groups: ['groups'] as const,
  group: (gid: string) => ['group', gid] as const,
  groupBalance: (gid: string) => ['group', gid, 'balance'] as const,
  activity: (gid: string, aid: string) => ['activity', gid, aid] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<{ user: MeUser }>('/api/auth/me').then((r) => r.user),
    retry: false,
  });
}

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () =>
      api<{ groups: GroupListEntry[] }>('/api/groups').then((r) => r.groups),
  });
}

export function useGroup(gid: string | undefined) {
  return useQuery({
    enabled: Boolean(gid),
    queryKey: gid ? queryKeys.group(gid) : ['group', 'none'],
    queryFn: () =>
      api<{ group: GroupDetail }>(`/api/groups/${gid}`).then((r) => r.group),
  });
}

export function useGroupBalance(gid: string | undefined) {
  return useQuery({
    enabled: Boolean(gid),
    queryKey: gid ? queryKeys.groupBalance(gid) : ['group', 'none', 'balance'],
    queryFn: () =>
      api<{ balance: GroupBalance }>(`/api/groups/${gid}/balance`).then((r) => r.balance),
  });
}

export function useActivity(gid: string | undefined, aid: string | undefined) {
  return useQuery({
    enabled: Boolean(gid && aid),
    queryKey: gid && aid ? queryKeys.activity(gid, aid) : ['activity', 'none', 'none'],
    queryFn: () =>
      api<ActivityDetailPayload>(`/api/groups/${gid}/activities/${aid}`),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api<{ user: MeUser }>('/api/auth/login', { method: 'POST', body: vars }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me, data.user);
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api<{ user: MeUser }>('/api/auth/signup', { method: 'POST', body: vars }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me, data.user);
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; currency: Currency }) =>
      api<{ group: GroupListEntry }>('/api/groups', { method: 'POST', body: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}

export function useRenameGroup(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string }) =>
      api<{ group: { id: string; name: string } }>(`/api/groups/${gid}`, {
        method: 'PATCH',
        body: vars,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.groups });
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gid: string) =>
      api<{ ok: true }>(`/api/groups/${gid}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}

export function useAddMember(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string }) =>
      api<{ members: Member[] }>(`/api/groups/${gid}/members`, {
        method: 'POST',
        body: vars,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
    },
  });
}

export function useRenameMember(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { mid: string; name: string }) =>
      api<{ members: Member[] }>(`/api/groups/${gid}/members/${vars.mid}`, {
        method: 'PATCH',
        body: { name: vars.name },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
    },
  });
}

export function useDeleteMember(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mid: string) =>
      api<{ members: Member[] }>(`/api/groups/${gid}/members/${mid}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
    },
  });
}

export function useAddActivity(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string }) =>
      api<{ activities: Activity[] }>(`/api/groups/${gid}/activities`, {
        method: 'POST',
        body: vars,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
    },
  });
}

export function useRenameActivity(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { aid: string; name: string }) =>
      api<{ activities: Activity[] }>(`/api/groups/${gid}/activities/${vars.aid}`, {
        method: 'PATCH',
        body: { name: vars.name },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(gid, v.aid) });
    },
  });
}

export function useDeleteActivity(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aid: string) =>
      api<{ activities: Activity[] }>(`/api/groups/${gid}/activities/${aid}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
      qc.invalidateQueries({ queryKey: queryKeys.groupBalance(gid) });
    },
  });
}

export function useMarkActivityBalanced(gid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aid: string) =>
      api<{ activities: Activity[]; invoices: Invoice[] }>(
        `/api/groups/${gid}/activities/${aid}/balance`,
        { method: 'POST', body: {} },
      ),
    onSuccess: (_d, aid) => {
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
      qc.invalidateQueries({ queryKey: queryKeys.groupBalance(gid) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(gid, aid) });
    },
  });
}

export interface InvoiceInputPayload {
  date: string;
  concept: string;
  description?: string;
  amount: number;
  payerId: string;
  split?: Record<string, number>;
}

export function useCreateInvoice(gid: string, aid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: InvoiceInputPayload) =>
      api<{ invoice: Invoice; balance: ActivityBalance }>(
        `/api/groups/${gid}/activities/${aid}/invoices`,
        { method: 'POST', body: vars },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activity(gid, aid) });
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
      qc.invalidateQueries({ queryKey: queryKeys.groupBalance(gid) });
    },
  });
}

export function useUpdateInvoice(gid: string, aid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { iid: string; payload: InvoiceInputPayload }) =>
      api<{ invoice: Invoice; balance: ActivityBalance }>(
        `/api/groups/${gid}/activities/${aid}/invoices/${vars.iid}`,
        { method: 'PATCH', body: vars.payload },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activity(gid, aid) });
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
      qc.invalidateQueries({ queryKey: queryKeys.groupBalance(gid) });
    },
  });
}

export function useDeleteInvoice(gid: string, aid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (iid: string) =>
      api<{ invoices: Invoice[]; balance: ActivityBalance }>(
        `/api/groups/${gid}/activities/${aid}/invoices/${iid}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activity(gid, aid) });
      qc.invalidateQueries({ queryKey: queryKeys.group(gid) });
      qc.invalidateQueries({ queryKey: queryKeys.groupBalance(gid) });
    },
  });
}

export function useImportGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api<{ group: GroupListEntry }>('/api/groups/import', {
        method: 'POST',
        body: fd,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}

