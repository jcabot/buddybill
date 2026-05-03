import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../components/ui/Button.js';
import { SplitEditor } from '../components/SplitEditor.js';
import { OcrCapture } from '../components/OcrCapture.js';
import {
  useActivity,
  useCreateInvoice,
  useUpdateInvoice,
} from '../api/queries.js';
import { ApiError } from '../api/client.js';
import { toMinor } from '@buddysplit/shared';

const formSchema = z.object({
  concept: z.string().trim().min(1, 'Required').max(80),
  description: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Required'),
  amount: z.coerce.number().positive('Must be > 0'),
  payerId: z.string().min(1, 'Required'),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  mode: 'create' | 'edit';
}

export function InvoiceFormPage({ mode }: Props) {
  const { gid = '', aid = '', iid } = useParams<{ gid: string; aid: string; iid?: string }>();
  const data = useActivity(gid, aid);
  const create = useCreateInvoice(gid, aid);
  const update = useUpdateInvoice(gid, aid);
  const nav = useNavigate();

  const editingInvoice =
    mode === 'edit' && iid ? data.data?.invoices.find((i) => i.id === iid) : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      concept: '',
      description: '',
      amount: 0,
      payerId: '',
    },
  });
  const amount = form.watch('amount');
  const [split, setSplit] = useState<Record<string, number> | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Hydrate when editing or once members load
  useEffect(() => {
    if (!data.data) return;
    if (editingInvoice) {
      form.reset({
        date: editingInvoice.date,
        concept: editingInvoice.concept,
        description: editingInvoice.description,
        amount: editingInvoice.amount,
        payerId: editingInvoice.payerId,
      });
      setSplit({ ...editingInvoice.split });
    } else if (!form.getValues('payerId') && data.data.members[0]) {
      form.setValue('payerId', data.data.members[0].id);
    }
  }, [data.data, editingInvoice, form]);

  if (data.isLoading) return <p className="text-muted">Loading…</p>;
  if (data.error || !data.data) return <p className="text-danger">Could not load activity.</p>;
  const { members, currency, activity } = data.data;
  if (activity.balanced) {
    return <p className="text-muted">This activity is balanced — no more changes.</p>;
  }
  if (members.length === 0) {
    return <p className="text-muted">Add a member first.</p>;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl">{mode === 'edit' ? 'Edit invoice' : 'New invoice'}</h1>

      {mode === 'create' && (
        <section className="card p-4">
          <OcrCapture
            onResult={(r) => {
              if (r.amount !== undefined) form.setValue('amount', r.amount);
              if (r.date) form.setValue('date', r.date);
            }}
          />
        </section>
      )}

      <form
        className="space-y-4 card p-4"
        onSubmit={form.handleSubmit(async (vals) => {
          setSubmitErr(null);
          // sanitize split (only known members, non-negative)
          const sanitized: Record<string, number> | undefined = split
            ? Object.fromEntries(
                members.map((m) => [m.id, Math.max(0, Number(split[m.id] ?? 0))]),
              )
            : undefined;
          if (sanitized) {
            const sumMinor = Object.values(sanitized).reduce(
              (s, v) => s + toMinor(v, currency),
              0,
            );
            const targetMinor = toMinor(vals.amount, currency);
            if (sumMinor !== targetMinor) {
              setSubmitErr("That split doesn't quite add up — try again.");
              return;
            }
          }
          const payload = {
            date: vals.date,
            concept: vals.concept,
            description: vals.description ?? '',
            amount: vals.amount,
            payerId: vals.payerId,
            ...(sanitized ? { split: sanitized } : {}),
          };
          try {
            if (mode === 'edit' && iid) {
              await update.mutateAsync({ iid, payload });
            } else {
              await create.mutateAsync(payload);
            }
            nav(`/groups/${gid}/activities/${aid}`);
          } catch (err) {
            setSubmitErr(err instanceof ApiError ? err.message : 'Save failed');
          }
        })}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Concept</label>
            <input className="input" placeholder="Dinner, taxi, hotel…" {...form.register('concept')} />
            {form.formState.errors.concept && (
              <p className="text-danger text-sm mt-1">{form.formState.errors.concept.message}</p>
            )}
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" {...form.register('date')} />
          </div>
          <div>
            <label className="label">Amount ({currency})</label>
            <input
              className="input"
              type="number"
              step="0.01"
              inputMode="decimal"
              {...form.register('amount', { valueAsNumber: true })}
            />
            {form.formState.errors.amount && (
              <p className="text-danger text-sm mt-1">{form.formState.errors.amount.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <label className="label">Paid by</label>
            <Controller
              control={form.control}
              name="payerId"
              render={({ field }) => (
                <select className="input" {...field}>
                  <option value="">Select…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            />
            {form.formState.errors.payerId && (
              <p className="text-danger text-sm mt-1">{form.formState.errors.payerId.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} {...form.register('description')} />
          </div>
        </div>

        <SplitEditor
          members={members}
          amount={Number(amount) || 0}
          currency={currency}
          value={split}
          onChange={setSplit}
        />

        {submitErr && <p className="text-danger text-sm">{submitErr}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => nav(`/groups/${gid}/activities/${aid}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || update.isPending}>
            {mode === 'edit' ? 'Save' : 'Add invoice'}
          </Button>
        </div>
      </form>
    </div>
  );
}
