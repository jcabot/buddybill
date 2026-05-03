import * as XLSX from 'xlsx';
import { z } from 'zod';
import {
  SCHEMA_VERSION,
  SHEET_ACTIVITIES,
  SHEET_MEMBERS,
  SHEET_META,
  SUPPORTED_CURRENCIES,
  minorPlaces,
  type Currency,
  type Activity,
  type GroupBalance,
  type GroupMeta,
  type GroupSnapshot,
  type Invoice,
  type Member,
  type Split,
} from '@buddysplit/shared';
import { badRequest } from '../errors.js';

interface MetaRow {
  key: string;
  value: string | number | boolean;
}

const META_KEYS = {
  schemaVersion: 'schema_version',
  groupId: 'group_id',
  groupName: 'group_name',
  ownerUserId: 'owner_user_id',
  currency: 'currency',
  createdAt: 'created_at',
} as const;

const BALANCE_SHEET = 'Balance';
const RESERVED_SHEET_NAMES = new Set([
  SHEET_META,
  SHEET_MEMBERS,
  SHEET_ACTIVITIES,
  BALANCE_SHEET,
]);

function readSheet<T = unknown>(wb: XLSX.WorkBook, name: string): T[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<T>(sheet, { defval: '' });
}

function writeSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (wb.Sheets[name]) {
    delete wb.Sheets[name];
    wb.SheetNames = wb.SheetNames.filter((n) => n !== name);
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function readMeta(wb: XLSX.WorkBook): GroupMeta {
  const rows = readSheet<MetaRow>(wb, SHEET_META);
  const map = new Map(rows.map((r) => [String(r.key), r.value]));
  const get = (k: string): string => {
    const v = map.get(k);
    if (v === undefined || v === '') throw badRequest(`Meta missing required key: ${k}`);
    return String(v);
  };
  return {
    id: get(META_KEYS.groupId),
    name: get(META_KEYS.groupName),
    ownerUserId: get(META_KEYS.ownerUserId),
    currency: get(META_KEYS.currency) as Currency,
    createdAt: get(META_KEYS.createdAt),
    schemaVersion: Number(get(META_KEYS.schemaVersion)),
  };
}

function writeMeta(wb: XLSX.WorkBook, meta: GroupMeta): void {
  const rows: MetaRow[] = [
    { key: META_KEYS.schemaVersion, value: meta.schemaVersion },
    { key: META_KEYS.groupId, value: meta.id },
    { key: META_KEYS.groupName, value: meta.name },
    { key: META_KEYS.ownerUserId, value: meta.ownerUserId },
    { key: META_KEYS.currency, value: meta.currency },
    { key: META_KEYS.createdAt, value: meta.createdAt },
  ];
  writeSheet(wb, SHEET_META, rows as unknown as Record<string, unknown>[]);
}

function readMembers(wb: XLSX.WorkBook): Member[] {
  const rows = readSheet<{ member_id: string; name: string }>(wb, SHEET_MEMBERS);
  return rows
    .filter((r) => r.member_id)
    .map((r) => ({ id: String(r.member_id), name: String(r.name) }));
}

function writeMembers(wb: XLSX.WorkBook, members: Member[]): void {
  writeSheet(
    wb,
    SHEET_MEMBERS,
    members.map((m) => ({ member_id: m.id, name: m.name })),
  );
}

function readActivities(wb: XLSX.WorkBook): Activity[] {
  const rows = readSheet<{ activity_id: string; name: string; balanced: boolean | string }>(
    wb,
    SHEET_ACTIVITIES,
  );
  return rows
    .filter((r) => r.activity_id)
    .map((r) => ({
      id: String(r.activity_id),
      name: String(r.name),
      balanced: parseBool(r.balanced),
    }));
}

function writeActivities(wb: XLSX.WorkBook, activities: Activity[]): void {
  writeSheet(
    wb,
    SHEET_ACTIVITIES,
    activities.map((a) => ({ activity_id: a.id, name: a.name, balanced: a.balanced })),
  );
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return false;
}

/**
 * Excel sheet-name rules: max 31 chars, cannot contain `:\/?*[]`, cannot be
 * empty. We strip illegal chars, truncate, and disambiguate collisions with a
 * `(2)`, `(3)` suffix. Deterministic given the input + already-taken names —
 * so the importer can recompute the same name and locate the sheet.
 */
function sanitizeSheetName(raw: string, taken: Set<string>): string {
  let s = raw.replace(/[\[\]:*?\\/]/g, '_').replace(/\s+/g, ' ').trim();
  s = s.slice(0, 31);
  if (!s) s = 'Activity';
  let candidate = s;
  let i = 2;
  while (taken.has(candidate) || RESERVED_SHEET_NAMES.has(candidate)) {
    const suffix = ` (${i})`;
    candidate = s.slice(0, 31 - suffix.length).trimEnd() + suffix;
    i++;
  }
  taken.add(candidate);
  return candidate;
}

/** Map activity_id -> friendly sheet name used in the export. */
function planSheetNames(activities: Activity[]): Map<string, string> {
  const taken = new Set<string>();
  const byId = new Map<string, string>();
  for (const a of activities) {
    byId.set(a.id, sanitizeSheetName(a.name, taken));
  }
  return byId;
}

function readActivitySheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  members: Member[],
): Invoice[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows
    .filter((r) => r.invoice_id)
    .map((r) => {
      const split: Split = {};
      for (const m of members) {
        const v = r[`share_${m.id}`];
        if (typeof v === 'number') split[m.id] = v;
        else if (typeof v === 'string' && v !== '') split[m.id] = Number(v);
        else split[m.id] = 0;
      }
      return {
        id: String(r.invoice_id),
        date: String(r.date ?? ''),
        concept: String(r.concept ?? ''),
        description: String(r.description ?? ''),
        amount: Number(r.amount ?? 0),
        payerId: String(r.payer_id ?? ''),
        balanced: parseBool(r.balanced),
        split,
      };
    });
}

function writeActivitySheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  members: Member[],
  invoices: Invoice[],
): XLSX.WorkSheet {
  const rows = invoices.map((inv) => {
    const row: Record<string, unknown> = {
      invoice_id: inv.id,
      date: inv.date,
      concept: inv.concept,
      description: inv.description,
      amount: inv.amount,
      payer_id: inv.payerId,
      balanced: inv.balanced,
    };
    for (const m of members) {
      row[`share_${m.id}`] = inv.split[m.id] ?? 0;
    }
    return row;
  });
  writeSheet(wb, sheetName, rows);
  return wb.Sheets[sheetName] as XLSX.WorkSheet;
}

function dropSheet(wb: XLSX.WorkBook, name: string): void {
  if (wb.Sheets[name]) {
    delete wb.Sheets[name];
    wb.SheetNames = wb.SheetNames.filter((n) => n !== name);
  }
}

// --- Migrations -------------------------------------------------------------
type Migration = (wb: XLSX.WorkBook) => void;
const MIGRATIONS: Migration[] = [
  // index 0 -> v1: nothing yet.
];

function migrate(wb: XLSX.WorkBook): void {
  const metaSheet = wb.Sheets[SHEET_META];
  if (!metaSheet) throw badRequest('Workbook missing Meta sheet');
  const rows = readSheet<MetaRow>(wb, SHEET_META);
  const versionRow = rows.find((r) => r.key === META_KEYS.schemaVersion);
  let v = versionRow ? Number(versionRow.value) : 0;
  if (Number.isNaN(v)) throw badRequest('Meta.schema_version is not a number');
  if (v > SCHEMA_VERSION) {
    throw badRequest(
      `Workbook schema_version=${v} is newer than this app (${SCHEMA_VERSION}). Upgrade the app to read it.`,
    );
  }
  while (v < SCHEMA_VERSION) {
    const mig = MIGRATIONS[v];
    if (!mig) throw badRequest(`No migration registered for v${v}`);
    mig(wb);
    v += 1;
  }
}

// --- Public API -------------------------------------------------------------
export function buildEmptyWorkbook(meta: GroupMeta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  writeMeta(wb, meta);
  writeMembers(wb, []);
  writeActivities(wb, []);
  return wb;
}

export function workbookFromBuffer(buf: Buffer): XLSX.WorkBook {
  const wb = XLSX.read(buf, { type: 'buffer' });
  migrate(wb);
  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function snapshotFromWorkbook(wb: XLSX.WorkBook): GroupSnapshot {
  const meta = readMeta(wb);
  const members = readMembers(wb);
  const activities = readActivities(wb);
  const invoicesByActivity: Record<string, Invoice[]> = {};
  for (const a of activities) {
    invoicesByActivity[a.id] = readActivitySheet(wb, a.id, members);
  }
  return { meta, members, activities, invoicesByActivity };
}

/**
 * Source-of-truth writer: keeps activity sheets named by `activity_id`. This
 * keeps mutation paths simple (rename activity = no sheet rename) and avoids
 * collisions on disk. Friendly names are only used by `workbookForExport`.
 */
export function workbookFromSnapshot(snap: GroupSnapshot): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  writeMeta(wb, { ...snap.meta, schemaVersion: SCHEMA_VERSION });
  writeMembers(wb, snap.members);
  writeActivities(wb, snap.activities);
  for (const a of snap.activities) {
    const invs = snap.invoicesByActivity[a.id] ?? [];
    writeActivitySheet(wb, a.id, snap.members, invs);
  }
  return wb;
}

export function dropActivitySheet(wb: XLSX.WorkBook, activityId: string): void {
  dropSheet(wb, activityId);
}

// ---------- Export-only formatting helpers ----------------------------------

const COL = (i: number) => XLSX.utils.encode_col(i);

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map((wch) => ({ wch }));
}

function setNumberFormatColumn(
  ws: XLSX.WorkSheet,
  colIndex: number,
  format: string,
  startRow = 1,
): void {
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
  if (!range) return;
  const colLetter = COL(colIndex);
  for (let r = startRow; r <= range.e.r; r++) {
    const addr = `${colLetter}${r + 1}`;
    const cell = ws[addr];
    if (cell && cell.t === 'n') {
      cell.z = format;
    }
  }
}

function moneyFormat(currency: Currency): string {
  return minorPlaces(currency) === 0 ? '#,##0' : '#,##0.00';
}

function styleActivitySheet(
  ws: XLSX.WorkSheet,
  members: Member[],
  invoiceCount: number,
  currency: Currency,
): void {
  // columns: invoice_id | date | concept | description | amount | payer_id | balanced | share_<m1..>
  const widths = [14, 12, 22, 30, 12, 14, 10, ...members.map(() => 14)];
  setColumnWidths(ws, widths);
  const fmt = moneyFormat(currency);
  // amount column index = 4
  for (let r = 1; r <= invoiceCount; r++) {
    const addr = `${COL(4)}${r + 1}`;
    const cell = ws[addr];
    if (cell && cell.t === 'n') cell.z = fmt;
  }
  // share columns
  for (let mi = 0; mi < members.length; mi++) {
    const colIdx = 7 + mi;
    for (let r = 1; r <= invoiceCount; r++) {
      const addr = `${COL(colIdx)}${r + 1}`;
      const cell = ws[addr];
      if (cell && cell.t === 'n') cell.z = fmt;
    }
  }
}

function styleNumericRange(
  ws: XLSX.WorkSheet,
  cols: number[],
  fromRow: number,
  toRow: number,
  fmt: string,
): void {
  for (const c of cols) {
    for (let r = fromRow; r <= toRow; r++) {
      const addr = `${COL(c)}${r + 1}`;
      const cell = ws[addr];
      if (cell && cell.t === 'n') cell.z = fmt;
    }
  }
}

/**
 * Builds an *enriched* workbook for download. Same source-of-truth sheets as
 * `workbookFromSnapshot` (so re-importing works), plus:
 *   - activity sheets named by friendly name (sanitized + de-duplicated)
 *   - a balance summary appended to each activity sheet (below the invoices)
 *   - a final `Balance` sheet with per-member totals + per-activity breakdown
 *
 * Summary rows have no `invoice_id`, so the importer ignores them.
 * `snapshotFromWorkbook` falls back from the friendly name to `activity_id`,
 * so old files continue to import correctly too.
 */
export function workbookForExport(
  snap: GroupSnapshot,
  balance: GroupBalance,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  writeMeta(wb, { ...snap.meta, schemaVersion: SCHEMA_VERSION });
  writeMembers(wb, snap.members);
  writeActivities(wb, snap.activities);

  const fmt = moneyFormat(snap.meta.currency);
  const sheetNameById = planSheetNames(snap.activities);

  // Members sheet widths
  if (wb.Sheets[SHEET_MEMBERS]) {
    setColumnWidths(wb.Sheets[SHEET_MEMBERS], [16, 24]);
  }
  // Activities sheet widths
  if (wb.Sheets[SHEET_ACTIVITIES]) {
    setColumnWidths(wb.Sheets[SHEET_ACTIVITIES], [16, 28, 10]);
  }
  // Meta sheet widths
  if (wb.Sheets[SHEET_META]) {
    setColumnWidths(wb.Sheets[SHEET_META], [16, 36]);
  }

  for (const a of snap.activities) {
    const sheetName = sheetNameById.get(a.id)!;
    const invs = snap.invoicesByActivity[a.id] ?? [];
    const ws = writeActivitySheet(wb, sheetName, snap.members, invs);
    styleActivitySheet(ws, snap.members, invs.length, snap.meta.currency);

    // Append per-activity balance summary
    const actBal = balance.perActivity.find((p) => p.activityId === a.id);
    if (actBal) {
      const summaryStart = invs.length + 1; // 0-based row index of the appended block start (blank row)
      const rows: (string | number | boolean)[][] = [
        [],
        ['Balance summary', a.balanced ? '(activity is balanced)' : ''],
        ['member_id', 'name', 'paid', 'contribution', 'net'],
        ...actBal.members.map(
          (m) =>
            [m.memberId, m.memberName, m.paid, m.contribution, m.net] as (string | number)[],
        ),
      ];
      XLSX.utils.sheet_add_aoa(ws, rows, { origin: -1 });
      // money format on paid/contribution/net columns (cols 2,3,4) of the
      // summary data rows (3 rows below summaryStart for the 3 header lines)
      const dataStart = summaryStart + 3;
      const dataEnd = dataStart + actBal.members.length - 1;
      styleNumericRange(ws, [2, 3, 4], dataStart, dataEnd, fmt);
    }
  }

  // Build the global Balance sheet
  const summaryRows: (string | number | boolean)[][] = [
    ['Group', snap.meta.name],
    ['Currency', snap.meta.currency],
    ['Generated', new Date().toISOString()],
    [],
    ['Per-member totals', '(open activities only — balanced activities excluded)'],
    ['member_id', 'name', 'paid', 'contribution', 'net'],
    ...balance.totals.map(
      (m) => [m.memberId, m.memberName, m.paid, m.contribution, m.net] as (string | number)[],
    ),
    [],
    ['Per-activity breakdown'],
    ['activity_id', 'activity', 'balanced', 'member_id', 'name', 'paid', 'contribution', 'net'],
    ...balance.perActivity.flatMap((p) =>
      p.members.map(
        (m) =>
          [
            p.activityId,
            p.activityName,
            p.balanced,
            m.memberId,
            m.memberName,
            m.paid,
            m.contribution,
            m.net,
          ] as (string | number | boolean)[],
      ),
    ),
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  setColumnWidths(summary, [16, 22, 12, 16, 18, 12, 14, 12]);

  // Number-format the totals data rows (cols 2,3,4) and breakdown data rows (cols 5,6,7)
  const totalsStart = 6; // 0-based: header rows are 0..5, then totals data
  const totalsEnd = totalsStart + balance.totals.length - 1;
  styleNumericRange(summary, [2, 3, 4], totalsStart, totalsEnd, fmt);
  const breakdownHeaderRow = totalsEnd + 3; // 1 blank, 1 header, 1 column titles
  const breakdownDataStart = breakdownHeaderRow + 1;
  const breakdownDataEnd =
    breakdownDataStart +
    balance.perActivity.reduce((s, p) => s + p.members.length, 0) -
    1;
  styleNumericRange(summary, [5, 6, 7], breakdownDataStart, breakdownDataEnd, fmt);

  XLSX.utils.book_append_sheet(wb, summary, BALANCE_SHEET);
  return wb;
}

// ---------- Strict reader for our own export format -------------------------

const idRegex = /^[a-z]{3}_[a-z0-9]+$/;

const memberRowSchema = z.object({
  member_id: z.string().regex(idRegex, 'invalid member_id'),
  name: z.string().trim().min(1).max(60),
});

const activityRowSchema = z.object({
  activity_id: z.string().regex(idRegex, 'invalid activity_id'),
  name: z.string().trim().min(1).max(80),
  balanced: z.union([z.boolean(), z.string(), z.number()]),
});

const invoiceRowSchema = z.object({
  invoice_id: z.string().regex(idRegex, 'invalid invoice_id'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  concept: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional().default(''),
  amount: z.number().positive().finite(),
  payer_id: z.string().regex(idRegex, 'invalid payer_id'),
  balanced: z.union([z.boolean(), z.string(), z.number()]),
});

const metaImportSchema = z.object({
  group_name: z.string().trim().min(1).max(80),
  currency: z.enum(SUPPORTED_CURRENCIES),
  schema_version: z.coerce.number().int().min(1).max(SCHEMA_VERSION),
  created_at: z.string().min(1).optional(),
});

function normalizeDate(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v ?? '');
}

function rejectIf<T>(parsed: z.SafeParseReturnType<unknown, T>, where: string): T {
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    const path = first?.path.join('.') ?? '';
    throw badRequest(`${where}${path ? ` (${path})` : ''}: ${first?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

/**
 * Parse a workbook produced by `workbookForExport` into a `GroupSnapshot`.
 * Strict: only accepts our own export format. Any deviation throws a 400
 * with a precise location. Used for migrating data between deployments.
 */
export function snapshotFromExportWorkbook(wb: XLSX.WorkBook): GroupSnapshot {
  // --- Meta ----
  if (!wb.Sheets[SHEET_META]) throw badRequest('missing Meta sheet');
  const metaRows = readSheet<MetaRow>(wb, SHEET_META);
  const metaMap: Record<string, unknown> = {};
  for (const r of metaRows) if (r.key) metaMap[String(r.key)] = r.value;
  const metaParsed = rejectIf(metaImportSchema.safeParse(metaMap), 'Meta');

  const meta: GroupMeta = {
    id: '', // assigned by caller (fresh id)
    name: metaParsed.group_name,
    ownerUserId: '', // assigned by caller
    currency: metaParsed.currency as Currency,
    createdAt: metaParsed.created_at ?? new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };

  // --- Members ----
  if (!wb.Sheets[SHEET_MEMBERS]) throw badRequest('missing Members sheet');
  const memberRows = readSheet<Record<string, unknown>>(wb, SHEET_MEMBERS).filter(
    (r) => r.member_id,
  );
  const members: Member[] = memberRows.map((r, i) => {
    const parsed = rejectIf(memberRowSchema.safeParse(r), `Members row ${i + 2}`);
    return { id: parsed.member_id, name: parsed.name };
  });
  const memberIds = new Set(members.map((m) => m.id));
  if (members.length === 0) throw badRequest('Members sheet is empty');
  // Check uniqueness
  if (memberIds.size !== members.length) {
    throw badRequest('Members sheet contains duplicate member_id');
  }

  // --- Activities ----
  if (!wb.Sheets[SHEET_ACTIVITIES]) throw badRequest('missing Activities sheet');
  const activityRows = readSheet<Record<string, unknown>>(wb, SHEET_ACTIVITIES).filter(
    (r) => r.activity_id,
  );
  const activities: Activity[] = activityRows.map((r, i) => {
    const parsed = rejectIf(activityRowSchema.safeParse(r), `Activities row ${i + 2}`);
    return { id: parsed.activity_id, name: parsed.name, balanced: parseBool(parsed.balanced) };
  });
  const activityIds = new Set(activities.map((a) => a.id));
  if (activityIds.size !== activities.length) {
    throw badRequest('Activities sheet contains duplicate activity_id');
  }

  // --- Per-activity sheets, looked up by friendly sanitized name ----
  const sheetNameById = planSheetNames(activities);
  const invoicesByActivity: Record<string, Invoice[]> = {};

  for (const a of activities) {
    const expectedName = sheetNameById.get(a.id)!;
    const sheet = wb.Sheets[expectedName];
    if (!sheet) {
      throw badRequest(`missing activity sheet "${expectedName}" (for activity "${a.name}")`);
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const invoices: Invoice[] = [];
    const seenInvoiceIds = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      // Blank row separating invoices from the appended balance summary.
      if (!r.invoice_id) continue;
      // Sentinel: everything from here on is the balance summary block.
      if (r.invoice_id === 'Balance summary') break;

      const candidate = {
        invoice_id: r.invoice_id,
        date: normalizeDate(r.date),
        concept: r.concept,
        description: r.description ?? '',
        amount: typeof r.amount === 'string' ? Number(r.amount) : r.amount,
        payer_id: r.payer_id,
        balanced: r.balanced,
      };
      const parsed = rejectIf(
        invoiceRowSchema.safeParse(candidate),
        `Activity "${a.name}" row ${i + 2}`,
      );
      if (seenInvoiceIds.has(parsed.invoice_id)) {
        throw badRequest(
          `Activity "${a.name}" row ${i + 2}: duplicate invoice_id ${parsed.invoice_id}`,
        );
      }
      seenInvoiceIds.add(parsed.invoice_id);

      if (!memberIds.has(parsed.payer_id)) {
        throw badRequest(
          `Activity "${a.name}" row ${i + 2}: payer_id "${parsed.payer_id}" is not a member`,
        );
      }

      const split: Split = {};
      for (const m of members) {
        const v = r[`share_${m.id}`];
        if (typeof v === 'number') split[m.id] = v;
        else if (typeof v === 'string' && v !== '') split[m.id] = Number(v);
        else split[m.id] = 0;
        if (!Number.isFinite(split[m.id]) || split[m.id]! < 0) {
          throw badRequest(
            `Activity "${a.name}" row ${i + 2}: share_${m.id} must be a non-negative number`,
          );
        }
      }

      invoices.push({
        id: parsed.invoice_id,
        date: parsed.date,
        concept: parsed.concept,
        description: parsed.description ?? '',
        amount: parsed.amount,
        payerId: parsed.payer_id,
        balanced: parseBool(parsed.balanced),
        split,
      });
    }
    invoicesByActivity[a.id] = invoices;
  }

  return { meta, members, activities, invoicesByActivity };
}

export { migrate as migrateWorkbook };
