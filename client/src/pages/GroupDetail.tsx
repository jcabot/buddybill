import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../components/ui/Button.js';
import { Money } from '../components/ui/Money.js';
import { Modal } from '../components/ui/Modal.js';
import { Confirm } from '../components/ui/Confirm.js';
import {
  useAddActivity,
  useAddMember,
  useDeleteMember,
  useGroup,
  useGroupBalance,
  useRenameMember,
} from '../api/queries.js';
import { ApiError } from '../api/client.js';

const memberSchema = z.object({ name: z.string().trim().min(1).max(60) });
const activitySchema = z.object({ name: z.string().trim().min(1).max(80) });

export function GroupDetailPage() {
  const { gid = '' } = useParams<{ gid: string }>();
  const group = useGroup(gid);
  const balance = useGroupBalance(gid);
  const addMember = useAddMember(gid);
  const renameMember = useRenameMember(gid);
  const deleteMember = useDeleteMember(gid);
  const addActivity = useAddActivity(gid);
  const nav = useNavigate();

  const [memberOpen, setMemberOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [memberErr, setMemberErr] = useState<string | null>(null);

  const memberForm = useForm<{ name: string }>({ resolver: zodResolver(memberSchema) });
  const activityForm = useForm<{ name: string }>({ resolver: zodResolver(activitySchema) });

  if (group.isLoading) return <p className="text-muted">Loading…</p>;
  if (group.error || !group.data) return <p className="text-danger">Could not load group.</p>;
  const g = group.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl">{g.name}</h1>
          <p className="text-muted text-sm">{g.currency}</p>
        </div>
        <Link to={`/groups/${gid}/settings`} className="btn btn-ghost">Settings</Link>
      </div>

      <section className="card p-4">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-lg">Group balance</h2>
          {balance.data && balance.data.totals.length > 0 && (
            <span className="text-xs text-muted">across all open activities</span>
          )}
        </div>
        {!balance.data && <p className="text-muted text-sm">Loading…</p>}
        {balance.data && balance.data.totals.length === 0 && (
          <p className="text-muted text-sm">Add a member to start.</p>
        )}
        {balance.data && balance.data.totals.length > 0 && (
          <ul className="divide-y divide-border">
            {balance.data.totals.map((m) => (
              <li key={m.memberId} className="py-2 flex justify-between">
                <span>{m.memberName}</span>
                <Money amount={m.net} currency={g.currency} signed />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-lg">Members</h2>
          <Button variant="ghost" onClick={() => setMemberOpen(true)}>+ Add</Button>
        </div>
        {g.members.length === 0 ? (
          <p className="text-muted text-sm">No buddies yet — add some.</p>
        ) : (
          <ul className="divide-y divide-border">
            {g.members.map((m) => (
              <li key={m.id} className="py-2 flex justify-between items-center">
                <span>{m.name}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => setEditingMember({ id: m.id, name: m.name })}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete({ id: m.id, name: m.name })}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-lg">Activities</h2>
          <Button variant="ghost" onClick={() => setActivityOpen(true)} disabled={g.members.length === 0}>
            + Add
          </Button>
        </div>
        {g.activities.length === 0 ? (
          <p className="text-muted text-sm">
            {g.members.length === 0
              ? 'Add a member first.'
              : 'No activities yet — add one to start tracking expenses.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {g.activities.map((a) => (
              <li key={a.id} className="py-2">
                <Link
                  to={`/groups/${gid}/activities/${a.id}`}
                  className="flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold">{a.name}</p>
                    {a.balanced && <span className="pill pill-muted mt-1">Balanced</span>}
                  </div>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={memberOpen}
        onClose={() => {
          setMemberOpen(false);
          memberForm.reset();
          setMemberErr(null);
        }}
        title="Add member"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setMemberOpen(false);
                memberForm.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={memberForm.handleSubmit(async (vals) => {
                setMemberErr(null);
                try {
                  await addMember.mutateAsync(vals);
                  memberForm.reset();
                  setMemberOpen(false);
                } catch (err) {
                  setMemberErr(err instanceof Error ? err.message : 'Failed');
                }
              })}
            >
              Add
            </Button>
          </>
        }
      >
        <input
          className="input"
          autoFocus
          placeholder="Name"
          autoComplete="off"
          {...memberForm.register('name')}
        />
        {memberErr && <p className="text-danger text-sm mt-2">{memberErr}</p>}
      </Modal>

      <Modal
        open={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title="Rename member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!editingMember) return;
                await renameMember.mutateAsync({
                  mid: editingMember.id,
                  name: editingMember.name,
                });
                setEditingMember(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <input
          className="input"
          value={editingMember?.name ?? ''}
          onChange={(e) =>
            setEditingMember(editingMember ? { ...editingMember, name: e.target.value } : null)
          }
        />
      </Modal>

      <Confirm
        open={Boolean(confirmDelete)}
        title={`Remove ${confirmDelete?.name ?? ''}?`}
        message="They'll be removed from the group. Members referenced by an unbalanced invoice can't be removed."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await deleteMember.mutateAsync(confirmDelete.id);
          } catch (err) {
            const msg =
              err instanceof ApiError ? err.message : 'Could not remove member';
            alert(msg);
          }
          setConfirmDelete(null);
        }}
      />

      <Modal
        open={activityOpen}
        onClose={() => {
          setActivityOpen(false);
          activityForm.reset();
        }}
        title="New activity"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setActivityOpen(false);
                activityForm.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={activityForm.handleSubmit(async (vals) => {
                const res = await addActivity.mutateAsync(vals);
                const created = res.activities[res.activities.length - 1];
                activityForm.reset();
                setActivityOpen(false);
                if (created) nav(`/groups/${gid}/activities/${created.id}`);
              })}
            >
              Create
            </Button>
          </>
        }
      >
        <input
          className="input"
          autoFocus
          placeholder="e.g. Lisbon Trip"
          {...activityForm.register('name')}
        />
      </Modal>
    </div>
  );
}
