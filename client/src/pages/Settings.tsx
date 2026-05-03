import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';
import { Confirm } from '../components/ui/Confirm.js';
import { Modal } from '../components/ui/Modal.js';
import {
  useDeleteGroup,
  useGroup,
  useRenameGroup,
} from '../api/queries.js';
import { apiBlob } from '../api/client.js';

export function GroupSettingsPage() {
  const { gid = '' } = useParams<{ gid: string }>();
  const group = useGroup(gid);
  const rename = useRenameGroup(gid);
  const del = useDeleteGroup();
  const nav = useNavigate();

  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (group.isLoading) return <p className="text-muted">Loading…</p>;
  if (group.error || !group.data) return <p className="text-danger">Could not load group.</p>;
  const g = group.data;

  async function downloadXlsx() {
    const blob = await apiBlob(`/api/groups/${gid}/export`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buddysplit-${g.name.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'group'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => nav(`/groups/${gid}`)} className="text-muted text-sm">
          ‹ Back
        </button>
        <h1 className="text-2xl mt-1">Settings</h1>
      </div>

      <section className="card p-4 space-y-3">
        <div>
          <p className="label">Name</p>
          <p className="text-lg font-bold">{g.name}</p>
        </div>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              setName(g.name);
              setRenameOpen(true);
            }}
          >
            Rename
          </Button>
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-lg">Export</h2>
        <p className="text-muted text-sm">
          Download the group's Excel file. It's the source of truth — open it in any spreadsheet app or re-import it later.
        </p>
        <div className="flex justify-end">
          <Button onClick={downloadXlsx}>Download .xlsx</Button>
        </div>
      </section>

      <section className="card p-4 border-danger/30">
        <h2 className="text-sm uppercase tracking-wide text-muted mb-2">Danger zone</h2>
        <p className="text-sm text-muted mb-3">
          Deleting a group removes its members, activities, and invoices. Export first if you want a copy.
        </p>
        <div className="flex justify-end">
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete group
          </Button>
        </div>
      </section>

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename group"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!name.trim()) return;
                await rename.mutateAsync({ name: name.trim() });
                setRenameOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>

      <Confirm
        open={confirmDelete}
        title={`Delete "${g.name}"?`}
        message="This permanently deletes the group and its Excel file."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await del.mutateAsync(gid);
          nav('/');
        }}
      />
    </div>
  );
}
