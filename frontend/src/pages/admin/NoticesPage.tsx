import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Megaphone,
  Plus,
  Pin,
  Trash2,
  RefreshCw,
  Clock,
  User,
  Filter,
  PinOff,
} from 'lucide-react';
import { societyAdminApi } from '../../api/society-admin.api';
import type { Notice, NoticeCategory } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export const NoticesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Create Notice Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formBody, setFormBody] = useState<string>('');
  const [formCategory, setFormCategory] = useState<NoticeCategory>('GENERAL');
  const [formIsPinned, setFormIsPinned] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Confirm Dialog
  const [noticeToDelete, setNoticeToDelete] = useState<Notice | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Check URL query param ?action=create
  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setIsCreateModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch notices
  const fetchNotices = useCallback(
    async (showRefreshing = false) => {
      if (!societyId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await societyAdminApi.getNotices(societyId);
        setNotices(data);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load community notices.';
        toastError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [societyId, toastError],
  );

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  // Handle Create Notice
  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !formTitle.trim() || !formBody.trim()) return;

    setIsSubmitting(true);
    try {
      // authorName/authorRole are derived server-side from the authenticated caller.
      const created = await societyAdminApi.createNotice(societyId, {
        title: formTitle.trim(),
        body: formBody.trim(),
        category: formCategory,
        isPinned: formIsPinned,
      });

      toastSuccess(`Notice "${created.title}" published to community board.`);
      setIsCreateModalOpen(false);
      setFormTitle('');
      setFormBody('');
      setFormCategory('GENERAL');
      setFormIsPinned(false);
      await fetchNotices(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to publish notice.';
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Toggle Pin
  const handleTogglePin = async (notice: Notice) => {
    if (!societyId) return;
    try {
      await societyAdminApi.togglePinNotice(societyId, notice.id);
      toastSuccess(notice.isPinned ? 'Notice unpinned.' : 'Notice pinned to top of board.');
      await fetchNotices(true);
    } catch (err: any) {
      toastError('Failed to toggle pin state.');
    }
  };

  // Handle Delete Notice
  const handleDeleteNotice = async () => {
    if (!societyId || !noticeToDelete) return;
    setIsDeleting(true);
    try {
      await societyAdminApi.deleteNotice(societyId, noticeToDelete.id);
      toastSuccess('Notice removed from board.');
      setNoticeToDelete(null);
      await fetchNotices(true);
    } catch (err: any) {
      toastError('Failed to delete notice.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered & Sorted notices (Pinned first, then newest)
  const filteredNotices = useMemo(() => {
    const list = notices.filter((n) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q);

      const matchCategory =
        categoryFilter === 'ALL' || n.category === categoryFilter;

      return matchSearch && matchCategory;
    });

    return list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [notices, searchQuery, categoryFilter]);

  const getCategoryBadgeVariant = (cat: NoticeCategory): 'danger' | 'warning' | 'info' | 'purple' | 'brand' | 'neutral' => {
    switch (cat) {
      case 'EMERGENCY':
        return 'danger';
      case 'MAINTENANCE':
        return 'warning';
      case 'SECURITY':
        return 'info';
      case 'EVENT':
        return 'purple';
      case 'BILLING':
        return 'brand';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Community Announcements & Notices"
        subtitle="Broadcast important maintenance updates, security protocols, and community events"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => fetchNotices(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh notices"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Announcement</span>
            </button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search announcements..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-base !py-1.5 !text-xs w-44 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="GENERAL">General</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="SECURITY">Security</option>
            <option value="EVENT">Event</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="BILLING">Billing / Dues</option>
          </select>
        </div>
      </div>

      {/* Notices Board Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="card p-6 h-48 bg-gray-100/50 animate-pulse rounded-2xl" />
          <div className="card p-6 h-48 bg-gray-100/50 animate-pulse rounded-2xl" />
        </div>
      ) : notices.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No notices published"
          description="Create your first announcement to inform residents of upcoming events or maintenance."
          action={
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary text-xs"
            >
              Create Notice
            </button>
          }
        />
      ) : filteredNotices.length === 0 ? (
        <NoResultsState
          query={searchQuery}
          onClear={() => {
            setSearchQuery('');
            setCategoryFilter('ALL');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredNotices.map((notice) => (
            <div
              key={notice.id}
              className={`card p-6 flex flex-col justify-between relative transition-all duration-200 ${
                notice.isPinned
                  ? 'border-amber-300/80 bg-gradient-to-b from-amber-50/30 to-white shadow-xs'
                  : 'hover:border-gray-300 hover:shadow-xs'
              }`}
            >
              {/* Header: Title & Badges */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getCategoryBadgeVariant(notice.category)} size="sm">
                      {notice.category}
                    </Badge>
                    {notice.isPinned && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
                        <Pin className="w-3 h-3 fill-amber-700" />
                        Pinned
                      </span>
                    )}
                  </div>

                  {/* Actions: Pin / Delete */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleTogglePin(notice)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        notice.isPinned
                          ? 'text-amber-700 hover:bg-amber-100'
                          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                      title={notice.isPinned ? 'Unpin notice' : 'Pin notice to top'}
                    >
                      {notice.isPinned ? (
                        <PinOff className="w-4 h-4" />
                      ) : (
                        <Pin className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoticeToDelete(notice)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete notice"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-gray-900 leading-snug">
                  {notice.title}
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {notice.body}
                </p>
              </div>

              {/* Footer: Author & Timestamp */}
              <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-1.5 font-medium text-gray-500">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span>{notice.authorName || 'Management Committee'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    {notice.createdAt
                      ? new Date(notice.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Recently'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Notice */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">Publish Society Notice</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Broadcast an official notification to all residents and security personnel
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreateNotice} className="space-y-4">
          <div>
            <label className="form-label">
              Notice Headline / Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Elevator Maintenance in Tower B"
              className="input-base w-full font-semibold"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as NoticeCategory)}
                className="input-base w-full cursor-pointer"
              >
                <option value="GENERAL">General Notice</option>
                <option value="MAINTENANCE">Facility Maintenance</option>
                <option value="SECURITY">Security Protocol</option>
                <option value="EVENT">Community Event</option>
                <option value="EMERGENCY">Urgent / Emergency</option>
                <option value="BILLING">Maintenance Dues / Billing</option>
              </select>
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formIsPinned}
                  onChange={(e) => setFormIsPinned(e.target.checked)}
                  className="rounded border-gray-300 text-[#cd0447] focus:ring-[#cd0447]"
                />
                <span>Pin notice to top of resident feeds</span>
              </label>
            </div>
          </div>

          <div>
            <label className="form-label">
              Notice Content / Body <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder="Provide complete details, time windows, and instructions for residents..."
              className="input-base w-full resize-y text-xs sm:text-sm"
            />
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formTitle.trim() || !formBody.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <span>Publish Notice</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(noticeToDelete)}
        onCancel={() => setNoticeToDelete(null)}
        onConfirm={handleDeleteNotice}
        title="Delete Announcement"
        message={`Are you sure you want to delete "${noticeToDelete?.title}"? This action cannot be undone.`}
        confirmLabel="Delete Notice"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default NoticesPage;
