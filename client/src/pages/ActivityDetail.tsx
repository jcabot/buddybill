import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Button } from '../components/ui/Button.js';
import { Confirm } from '../components/ui/Confirm.js';
import { Money } from '../components/ui/Money.js';
import {
  useActivity,
  useDeleteActivity,
  useDeleteInvoice,
  useMarkActivityBalanced,
  useRenameActivity,
} from '../api/queries.js';
import { Modal } from '../components/ui/Modal.js';

export function ActivityDetailPage() {
  const { gid = '', aid = '' } = useParams<{ gid: string; aid: string }>();
  const data = useActivity(gid, aid);
  const markBalanced = useMarkActivityBalanced(gid);
  const deleteInvoice = useDeleteInvoice(gid, aid);
  const renameActivity = useRenameActivity(gid);
  const deleteActivity = useDeleteActivity(gid);
  const nav = useNavigate();

  const [confirmBalance, setConfirmBalance] = useState(false);
  const [confirmDeleteInv, setConfirmDeleteInv] = useState<string | null>(null);
  const [confirmDeleteAct, setConfirmDeleteAct] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');

  if (data.isLoading) return <p className="text-muted">Loading…</p>;
  if (data.error || !data.data) return <p className="text-danger">Could not load activity.</p>;

  const { activity, invoices, balance, members, currency } = data.data;
  const memberNameById = (id: string) => members.find((m) => m.id === id)?.name ?? '?';

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/groups/${gid}`} className="text-muted text-sm">
          ‹ Group
        </Link>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="text-2xl">{activity.name}</h1>
            {activity.balanced && (
              <span className="pill pill-muted mt-1 inline-flex">Balanced</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setNewName(activity.name);
                setRenameOpen(true);
              }}
            >
              Rename
            </Button>
            {!activity.balanced && (
              <Button onClick={() => nav(`/groups/${gid}/activities/${aid}/invoices/new`)}>
                + Add invoice
              </Button>
            )}
          </div>
        </div>
      </div>

      <section className="card p-4">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-lg">Balance</h2>
          {!activity.balanced && invoices.length > 0 && (
            <Button variant="ghost" onClick={() => setConfirmBalance(true)}>
              Mark as balanced
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border">
          {balance.members.map((m) => (
            <li key={m.memberId} className="py-2 flex justify-between">
              <span>{m.memberName}</span>
              <Money amount={m.net} currency={currency} signed />
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="text-lg mb-3">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-muted text-sm">No expenses yet — add your first one.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id} className={`py-3 ${inv.balanced ? 'opacity-60' : ''}`}>
                <div className="flex justify-between items-baseline">
                  <div>
                    <p className="font-bold">{inv.concept}</p>
                    <p className="text-muted text-xs">
                      {format(parseISO(inv.date), 'MMM d')} · paid by {memberNameById(inv.payerId)}
                    </p>
                    {inv.description && (
                      <p className="text-sm text-muted mt-1">{inv.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Money amount={inv.amount} currency={currency} />
                    {!activity.balanced && !inv.balanced && (
                      <div className="flex gap-1">
                        <Link
                          to={`/groups/${gid}/activities/${aid}/invoices/${inv.id}/edit`}
                          className="btn btn-ghost text-xs"
                        >
                          Edit
                        </Link>
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={() => setConfirmDeleteInv(inv.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 border-danger/30">
        <h2 className="text-sm uppercase tracking-wide text-muted mb-2">Danger zone</h2>
        <Button variant="danger" onClick={() => setConfirmDeleteAct(true)}>
          Delete activity
        </Button>
      </section>

      <Confirm
        open={confirmBalance}
        title="Mark this activity as balanced?"
        message="Your buddies will thank you. All invoices in this activity will be marked balanced and excluded from balances."
        confirmLabel="Yes, mark balanced"
        onCancel={() => setConfirmBalance(false)}
        onConfirm={async () => {
          await markBalanced.mutateAsync(aid);
          setConfirmBalance(false);
        }}
      />

      <Confirm
        open={Boolean(confirmDeleteInv)}
        title="Delete this invoice?"
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeleteInv(null)}
        onConfirm={async () => {
          if (!confirmDeleteInv) return;
          await deleteInvoice.mutateAsync(confirmDeleteInv);
          setConfirmDeleteInv(null);
        }}
      />

      <Confirm
        open={confirmDeleteAct}
        title={`Delete "${activity.name}"?`}
        message="All invoices in this activity will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeleteAct(false)}
        onConfirm={async () => {
          await deleteActivity.mutateAsync(aid);
          nav(`/groups/${gid}`);
        }}
      />

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename activity"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!newName.trim()) return;
                await renameActivity.mutateAsync({ aid, name: newName.trim() });
                setRenameOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <input
          className="input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      </Modal>
    </div>
  );
}
