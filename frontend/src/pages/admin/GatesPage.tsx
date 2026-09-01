import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DoorOpen,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { societyAdminApi, CreateGatePayload } from '../../api/society-admin.api';
import type { Gate } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, NoResultsState, TableSkeleton } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export const GatesPage: React.FC = () => {
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [gates, setGates] = useState<Gate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Create/Edit Gate Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingGate, setEditingGate] = useState<Gate | null>(null);
  const [formData, setFormData] = useState<CreateGatePayload>({ name: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Confirm Dialog
  const [gateToDelete, setGateToDelete] = useState<Gate | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchGates = useCallback(
    async (showRefreshing = false) => {
      if (!societyId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await societyAdminApi.getGates(societyId);
        setGates(data || []);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load gates.';
        toastError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [societyId, toastError],
  );

  useEffect(() => {
    fetchGates();
  }, [fetchGates]);

  const openCreateModal = () => {
    setEditingGate(null);
    setFormData({ name: '', description: '' });
    setIsFormModalOpen(true);
  };

  const openEditModal = (gate: Gate) => {
    setEditingGate(gate);
    setFormData({ name: gate.name, description: gate.description || '' });
    setIsFormModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingGate) {
        await societyAdminApi.updateGate(societyId, editingGate.id, {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
        });
        toastSuccess(`Gate "${formData.name.trim()}" updated.`);
      } else {
        await societyAdminApi.createGate(societyId, {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
        });
        toastSuccess(`Gate "${formData.name.trim()}" created.`);
      }

      setIsFormModalOpen(false);
      setFormData({ name: '', description: '' });
      setEditingGate(null);
      await fetchGates(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save gate.';
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!societyId || !gateToDelete) return;
    setIsDeleting(true);
    try {
      await societyAdminApi.deleteGate(societyId, gateToDelete.id);
      toastSuccess(`Gate "${gateToDelete.name}" deleted.`);
      setGateToDelete(null);
      await fetchGates(true);
    } catch (err: any) {
      toastError('Failed to delete gate.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredGates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return gates;
    return gates.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q)),
    );
  }, [gates, searchQuery]);

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      <PageHeader
        title="Gates"
        subtitle="Define the physical entrances guards and hardware devices are assigned to"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => fetchGates(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh gates"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Gate</span>
            </button>
          </div>
        }
      />

      <div className="card-static p-4 bg-indigo-50/60 border border-indigo-100 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-900">
          Assign guards to a specific gate from the Users page, and hardware devices to a
          gate when provisioning them. A guard with no gate assigned can act at every gate
          in this society — the default for supervisors.
        </p>
      </div>

      <div className="w-full sm:w-80">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search gates..."
          className="w-full"
        />
      </div>

      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={3} rows={4} />
          </div>
        ) : gates.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="No gates defined"
            description="Add your society's entrances (Main Gate, Back Gate, etc.) so guards and devices can be assigned to them."
            action={
              <button type="button" onClick={openCreateModal} className="btn-primary text-xs">
                Add Gate
              </button>
            }
          />
        ) : filteredGates.length === 0 ? (
          <NoResultsState query={searchQuery} onClear={() => setSearchQuery('')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Description</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGates.map((gate) => (
                  <tr key={gate.id} className="hover:bg-gray-50/80">
                    <td className="font-semibold text-gray-900">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
                          <DoorOpen className="w-4.5 h-4.5" />
                        </div>
                        <span className="text-sm font-bold text-gray-900">{gate.name}</span>
                      </div>
                    </td>
                    <td className="text-xs text-gray-600">{gate.description || '—'}</td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(gate)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                          title="Edit gate"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setGateToDelete(gate)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete gate"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Gate */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">
              {editingGate ? `Edit Gate: ${editingGate.name}` : 'Add Gate'}
            </div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              A physical entrance guards and hardware devices can be assigned to
            </div>
          </div>
        }
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">
              Gate Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Main Gate"
              className="input-base w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="form-label">Description (Optional)</label>
            <input
              type="text"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. Primary vehicular entrance on Ring Road"
              className="input-base w-full"
            />
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsFormModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingGate ? 'Save Changes' : 'Add Gate'}</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(gateToDelete)}
        onCancel={() => setGateToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Gate"
        message={`Are you sure you want to delete "${gateToDelete?.name}"? Guards and devices assigned to it will fall back to unrestricted/unassigned rather than being locked out.`}
        confirmLabel="Delete Gate"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default GatesPage;
