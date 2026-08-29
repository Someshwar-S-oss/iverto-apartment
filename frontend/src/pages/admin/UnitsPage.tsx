import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Building2,
  Plus,
  RefreshCw,
  Home,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { societyAdminApi } from '../../api/society-admin.api';
import type { Unit } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export const UnitsPage: React.FC = () => {
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState<string>('ALL');

  // Modals state
  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState<boolean>(false);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState<boolean>(false);

  // Form states
  const [buildingNameInput, setBuildingNameInput] = useState<string>('');
  const [isCreatingBuilding, setIsCreatingBuilding] = useState<boolean>(false);

  const [selectedBuildingIdForUnit, setSelectedBuildingIdForUnit] = useState<string>('');
  const [unitNumberInput, setUnitNumberInput] = useState<string>('');
  const [isCreatingUnit, setIsCreatingUnit] = useState<boolean>(false);

  // Fetch units
  const fetchUnits = useCallback(
    async (showRefreshing = false) => {
      if (!societyId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await societyAdminApi.getUnits(societyId);
        setUnits(data);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load units. Please try again.';
        toastError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [societyId, toastError],
  );

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  // Derive unique buildings list from units
  const uniqueBuildings = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    units.forEach((u) => {
      if (u.buildingId && u.buildingName) {
        map.set(u.buildingId, { id: u.buildingId, name: u.buildingName });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);

  // Filtered units
  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      const matchSearch =
        u.unitNumber.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (u.buildingName && u.buildingName.toLowerCase().includes(searchQuery.toLowerCase().trim()));

      const matchBuilding =
        selectedBuildingFilter === 'ALL' || u.buildingId === selectedBuildingFilter;

      return matchSearch && matchBuilding;
    });
  }, [units, searchQuery, selectedBuildingFilter]);

  // Handle Add Building submit
  const handleCreateBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingNameInput.trim() || !societyId) return;

    setIsCreatingBuilding(true);
    try {
      const newBuilding = await societyAdminApi.createBuilding(
        societyId,
        buildingNameInput.trim(),
      );
      toastSuccess(`Building "${newBuilding.name}" created successfully.`);
      setBuildingNameInput('');
      setIsBuildingModalOpen(false);
      await fetchUnits(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to create building.';
      toastError(msg);
    } finally {
      setIsCreatingBuilding(false);
    }
  };

  // Handle Add Unit submit
  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuildingIdForUnit || !unitNumberInput.trim() || !societyId) return;

    setIsCreatingUnit(true);
    try {
      const newUnit = await societyAdminApi.createUnit(
        societyId,
        selectedBuildingIdForUnit,
        unitNumberInput.trim(),
      );
      toastSuccess(`Unit "${newUnit.unitNumber}" added successfully.`);
      setUnitNumberInput('');
      setIsUnitModalOpen(false);
      await fetchUnits(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to add unit.';
      toastError(msg);
    } finally {
      setIsCreatingUnit(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Buildings & Units"
        subtitle="Manage towers, wings, residential flats, and structural mapping"
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchUnits(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh units"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsBuildingModalOpen(true)}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
            >
              <Building2 className="w-4 h-4 text-gray-700" />
              <span>Add Building</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (uniqueBuildings.length > 0 && !selectedBuildingIdForUnit) {
                  setSelectedBuildingIdForUnit(uniqueBuildings[0].id);
                }
                setIsUnitModalOpen(true);
              }}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Unit</span>
            </button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-pink-100/80 text-[#cd0447] flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">
              {isLoading ? '...' : units.length}
            </div>
            <div className="text-xs font-semibold text-gray-500">Total Residential Units</div>
          </div>
        </div>

        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100/80 text-indigo-700 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">
              {isLoading ? '...' : uniqueBuildings.length}
            </div>
            <div className="text-xs font-semibold text-gray-500">Buildings / Towers</div>
          </div>
        </div>

        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">
              {isLoading ? '...' : `${units.length > 0 ? '100%' : '0%'}`}
            </div>
            <div className="text-xs font-semibold text-gray-500">Active Directory Mapping</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by unit number or building..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={selectedBuildingFilter}
              onChange={(e) => setSelectedBuildingFilter(e.target.value)}
              className="input-base !py-1.5 !text-xs w-full sm:w-48 cursor-pointer"
            >
              <option value="ALL">All Buildings ({uniqueBuildings.length})</option>
              {uniqueBuildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Units Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={4} rows={6} />
          </div>
        ) : units.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No residential units registered"
            description="Start by adding your society buildings/towers, then add units."
            action={
              <button
                type="button"
                onClick={() => setIsBuildingModalOpen(true)}
                className="btn-primary text-xs"
              >
                Add Building
              </button>
            }
          />
        ) : filteredUnits.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setSelectedBuildingFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit Number</th>
                  <th>Building / Tower</th>
                  <th>Unit ID</th>
                  <th>Access Setup</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnits.map((unit) => (
                  <tr key={unit.id} className="hover:bg-gray-50/80">
                    <td className="font-semibold text-gray-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-pink-50 text-[#cd0447] border border-pink-100 flex items-center justify-center shrink-0">
                          <Home className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">
                            Unit {unit.unitNumber}
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono">
                            {unit.buildingName || 'Building Unassigned'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        <span>{unit.buildingName || '—'}</span>
                      </div>
                    </td>
                    <td className="text-xs font-mono text-gray-500">
                      {unit.id.slice(0, 12)}...
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Provisioned
                      </span>
                    </td>
                    <td className="text-right">
                      <Badge variant="success" size="sm" dot>
                        ACTIVE
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add Building */}
      <Modal
        isOpen={isBuildingModalOpen}
        onClose={() => setIsBuildingModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">Add New Building / Tower</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Create a residential wing, tower or block in this society
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreateBuilding} className="space-y-4">
          <div>
            <label className="form-label">
              Building Name / Wing <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={buildingNameInput}
              onChange={(e) => setBuildingNameInput(e.target.value)}
              placeholder="e.g. Tower A, Wing B, Block 3"
              className="input-base w-full"
              autoFocus
            />
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsBuildingModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreatingBuilding || !buildingNameInput.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {isCreatingBuilding ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Building</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Unit */}
      <Modal
        isOpen={isUnitModalOpen}
        onClose={() => setIsUnitModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">Add Residential Unit</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Create a new flat or residence within a designated building
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreateUnit} className="space-y-4">
          <div>
            <label className="form-label">
              Select Building <span className="text-rose-500">*</span>
            </label>
            {uniqueBuildings.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                <span>No buildings found. Please create a building first.</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsUnitModalOpen(false);
                    setIsBuildingModalOpen(true);
                  }}
                  className="btn-primary !text-xs !py-1 !px-2.5"
                >
                  Add Building
                </button>
              </div>
            ) : (
              <select
                required
                value={selectedBuildingIdForUnit}
                onChange={(e) => setSelectedBuildingIdForUnit(e.target.value)}
                className="input-base w-full cursor-pointer"
              >
                <option value="" disabled>
                  Select a building / tower
                </option>
                {uniqueBuildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="form-label">
              Unit Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={unitNumberInput}
              onChange={(e) => setUnitNumberInput(e.target.value)}
              placeholder="e.g. 101, A-402, 12B"
              className="input-base w-full"
            />
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsUnitModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isCreatingUnit ||
                !unitNumberInput.trim() ||
                !selectedBuildingIdForUnit ||
                uniqueBuildings.length === 0
              }
              className="btn-primary flex items-center gap-2"
            >
              {isCreatingUnit ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Adding Unit...</span>
                </>
              ) : (
                <span>Add Unit</span>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UnitsPage;
