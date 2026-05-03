import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SUPPORTED_CURRENCIES, type Currency } from '@buddysplit/shared';
import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { useCreateGroup, useGroups, useImportGroup } from '../api/queries.js';
import { ApiError } from '../api/client.js';
import { format, parseISO } from 'date-fns';

const newGroupSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  currency: z.enum(SUPPORTED_CURRENCIES),
});
type NewGroupForm = z.infer<typeof newGroupSchema>;

export function DashboardPage() {
  const groups = useGroups();
  const create = useCreateGroup();
  const importGroup = useImportGroup();
  const [open, setOpen] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Your groups</h1>
        <div className="flex gap-2">
          <label className="btn btn-ghost cursor-pointer" title="Restore a group from a BuddySplit-exported .xlsx">
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={importGroup.isPending}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setImportErr(null);
                try {
                  await importGroup.mutateAsync(file);
                } catch (err) {
                  setImportErr(
                    err instanceof ApiError ? err.message : 'Import failed',
                  );
                }
              }}
            />
            {importGroup.isPending ? 'Importing…' : 'Import .xlsx'}
          </label>
          <Button onClick={() => setOpen(true)}>+ New group</Button>
        </div>
      </div>

      {importErr && (
        <div className="card p-3 text-sm text-danger">
          <p className="font-bold">Couldn't import that file.</p>
          <p>{importErr}</p>
          <p className="text-muted mt-1">
            Only files exported from BuddySplit are accepted.
          </p>
        </div>
      )}

      {groups.isLoading && <p className="text-muted">Loading…</p>}
      {groups.data && groups.data.length === 0 && (
        <div className="card p-6 text-center">
          <p className="text-lg mb-1">No groups yet.</p>
          <p className="text-muted text-sm mb-4">Start one and invite your buddies.</p>
          <Button onClick={() => setOpen(true)}>Create your first group</Button>
        </div>
      )}

      {groups.data && groups.data.length > 0 && (
        <ul className="space-y-3">
          {groups.data.map((g) => (
            <li key={g.id}>
              <Link to={`/groups/${g.id}`} className="card p-4 flex justify-between hover:shadow-card transition">
                <div>
                  <p className="font-bold text-lg">{g.name}</p>
                  <p className="text-muted text-sm">
                    {g.currency} · created {format(parseISO(g.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <span className="text-muted self-center">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewGroupModal
        open={open}
        onClose={() => setOpen(false)}
        onCreate={async (vals) => {
          await create.mutateAsync({ name: vals.name, currency: vals.currency as Currency });
          setOpen(false);
        }}
      />
    </div>
  );
}

interface NewGroupProps {
  open: boolean;
  onClose: () => void;
  onCreate: (vals: NewGroupForm) => Promise<void>;
}

function NewGroupModal({ open, onClose, onCreate }: NewGroupProps) {
  const { register, handleSubmit, formState, reset } = useForm<NewGroupForm>({
    resolver: zodResolver(newGroupSchema),
    defaultValues: { currency: 'EUR' },
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New group"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(async (vals) => {
              await onCreate(vals);
              reset();
            })}
          >
            Create
          </Button>
        </>
      }
    >
      <form className="space-y-3">
        <div>
          <label className="label" htmlFor="name">Group name</label>
          <input className="input" id="name" placeholder="Lisbon trip" {...register('name')} />
          {formState.errors.name && (
            <p className="text-danger text-sm mt-1">{formState.errors.name.message}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <select className="input" id="currency" {...register('currency')}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  );
}
