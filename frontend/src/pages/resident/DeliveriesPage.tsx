import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Truck,
  ShieldCheck,
  DoorOpen,
  Volume2,
  VolumeX,
  Clock,
  RefreshCw,
  Sliders,
  Save,
} from 'lucide-react';
import { residentApi } from '../../api/resident.api';
import type { DeliveryPlatform, DeliveryMode } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

interface PlatformConfig {
  key: DeliveryPlatform;
  name: string;
  category: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
  iconBg: string;
  description: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    key: 'BLINKIT',
    name: 'Blinkit',
    category: '10-Min Quick Grocery',
    colorBg: 'bg-amber-50/50',
    colorBorder: 'border-amber-200',
    colorText: 'text-amber-800',
    iconBg: 'bg-amber-100 text-amber-700',
    description: 'Instant grocery, dairy, and household essentials',
  },
  {
    key: 'ZEPTO',
    name: 'Zepto',
    category: 'Quick Commerce',
    colorBg: 'bg-purple-50/50',
    colorBorder: 'border-purple-200',
    colorText: 'text-purple-800',
    iconBg: 'bg-purple-100 text-purple-700',
    description: '10-minute grocery and fresh produce',
  },
  {
    key: 'SWIGGY',
    name: 'Swiggy Food',
    category: 'Food Delivery & Dineout',
    colorBg: 'bg-orange-50/50',
    colorBorder: 'border-orange-200',
    colorText: 'text-orange-800',
    iconBg: 'bg-orange-100 text-orange-700',
    description: 'Hot meal deliveries and restaurant orders',
  },
  {
    key: 'INSTAMART',
    name: 'Swiggy Instamart',
    category: 'Grocery & Essentials',
    colorBg: 'bg-orange-50/40',
    colorBorder: 'border-orange-200',
    colorText: 'text-orange-800',
    iconBg: 'bg-orange-100 text-orange-600',
    description: 'Instant groceries and packaged items',
  },
  {
    key: 'AMAZON',
    name: 'Amazon',
    category: 'E-Commerce Packages',
    colorBg: 'bg-sky-50/50',
    colorBorder: 'border-sky-200',
    colorText: 'text-sky-800',
    iconBg: 'bg-sky-100 text-sky-700',
    description: 'Amazon Prime, pantry, and parcel deliveries',
  },
  {
    key: 'FLIPKART',
    name: 'Flipkart',
    category: 'E-Commerce & Electronics',
    colorBg: 'bg-blue-50/50',
    colorBorder: 'border-blue-200',
    colorText: 'text-blue-800',
    iconBg: 'bg-blue-100 text-blue-700',
    description: 'Shopping parcels and couriers',
  },
  {
    key: 'OTHER',
    name: 'Other Couriers',
    category: 'DHL, BlueDart, DTDC, India Post',
    colorBg: 'bg-gray-50/70',
    colorBorder: 'border-gray-200',
    colorText: 'text-gray-800',
    iconBg: 'bg-gray-100 text-gray-700',
    description: 'General third-party logistics and local courier deliveries',
  },
];

interface PlatformRuleState {
  mode: DeliveryMode;
  windowStart: string;
  windowEnd: string;
  silent: boolean;
  isSaving?: boolean;
}

export const DeliveriesPage: React.FC = () => {
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'Flat';

  const [rules, setRules] = useState<Record<DeliveryPlatform, PlatformRuleState>>({
    BLINKIT: { mode: 'ASK_ME', windowStart: '07:00', windowEnd: '23:00', silent: false },
    ZEPTO: { mode: 'ASK_ME', windowStart: '07:00', windowEnd: '23:00', silent: false },
    SWIGGY: { mode: 'ASK_ME', windowStart: '07:00', windowEnd: '23:00', silent: false },
    INSTAMART: { mode: 'ASK_ME', windowStart: '07:00', windowEnd: '23:00', silent: false },
    AMAZON: { mode: 'ASK_ME', windowStart: '08:00', windowEnd: '21:00', silent: false },
    FLIPKART: { mode: 'ASK_ME', windowStart: '08:00', windowEnd: '21:00', silent: false },
    OTHER: { mode: 'ASK_ME', windowStart: '09:00', windowEnd: '20:00', silent: false },
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [savingPlatform, setSavingPlatform] = useState<DeliveryPlatform | null>(null);

  // Load existing permissions
  const fetchPermissions = useCallback(
    async (showRefreshing = false) => {
      if (!unitId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await residentApi.getDeliveryPermissions(unitId);
        if (data && Array.isArray(data)) {
          setRules((prev) => {
            const next = { ...prev };
            data.forEach((p) => {
              if (p.platform && next[p.platform]) {
                next[p.platform] = {
                  mode: p.mode || 'ASK_ME',
                  windowStart: p.windowStart || '08:00',
                  windowEnd: p.windowEnd || '22:00',
                  silent: Boolean(p.silent),
                };
              }
            });
            return next;
          });
        }
      } catch (err: any) {
        console.error('Failed to load delivery permissions:', err);
        toastError('Failed to fetch delivery settings.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [unitId, toastError],
  );

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Save changes for a platform rule
  const handleSaveRule = async (platform: DeliveryPlatform) => {
    if (!unitId) return;
    const rule = rules[platform];
    setSavingPlatform(platform);

    try {
      await residentApi.updateDeliveryPermission(unitId, platform, {
        mode: rule.mode,
        windowStart: rule.windowStart || null,
        windowEnd: rule.windowEnd || null,
        silent: rule.silent,
      });

      toastSuccess(`Delivery settings saved for ${platform}.`);
    } catch (err: any) {
      console.error('Failed to save delivery permission:', err);
      toastError(err.response?.data?.message || `Failed to update ${platform} rule.`);
    } finally {
      setSavingPlatform(null);
    }
  };

  // Bulk set all platforms to a mode
  const handleBulkSetMode = async (mode: DeliveryMode) => {
    if (!unitId) return;
    const updated = { ...rules };
    PLATFORMS.forEach((p) => {
      updated[p.key] = { ...updated[p.key], mode };
    });
    setRules(updated);

    try {
      await Promise.all(
        PLATFORMS.map((p) =>
          residentApi.updateDeliveryPermission(unitId, p.key, {
            mode,
            windowStart: updated[p.key].windowStart,
            windowEnd: updated[p.key].windowEnd,
            silent: updated[p.key].silent,
          }),
        ),
      );
      toastSuccess(`All delivery platforms set to ${mode.replace(/_/g, ' ')}.`);
    } catch (err) {
      console.error('Failed bulk update:', err);
      toastError('Failed to apply bulk settings.');
    }
  };

  const updateField = (
    platform: DeliveryPlatform,
    field: keyof PlatformRuleState,
    value: any,
  ) => {
    setRules((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Delivery Automation Rules"
        subtitle={`Configure automated gate clearance, direct-to-door access, or leave-at-gate instructions for Flat ${unitNumber}`}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchPermissions(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh permissions"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Mode Explanation & Quick Bulk Presets */}
      <div className="card-static p-5 bg-gradient-to-r from-pink-50/50 via-white to-amber-50/50 border border-gray-200/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-100 text-[#cd0447] flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">How Delivery Automation Works</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                When a courier arrives, the gate kiosk automatically checks your rule for that platform.
              </p>
            </div>
          </div>

          {/* Bulk Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 mr-1">Quick Preset:</span>
            <button
              type="button"
              onClick={() => handleBulkSetMode('ASK_ME')}
              className="btn-secondary !text-xs !py-1.5 !px-3"
            >
              All Ask Me
            </button>
            <button
              type="button"
              onClick={() => handleBulkSetMode('ALLOW_TO_DOOR')}
              className="btn-secondary !text-xs !py-1.5 !px-3 !bg-emerald-50 !text-emerald-700 !border-emerald-200 hover:!bg-emerald-100"
            >
              All Allow to Door
            </button>
            <button
              type="button"
              onClick={() => handleBulkSetMode('LEAVE_AT_GATE')}
              className="btn-secondary !text-xs !py-1.5 !px-3 !bg-amber-50 !text-amber-700 !border-amber-200 hover:!bg-amber-100"
            >
              All Leave at Gate
            </button>
          </div>
        </div>

        {/* 3 Modes info pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-gray-100">
          <div className="p-3 rounded-xl bg-white border border-gray-200/80">
            <div className="font-bold text-gray-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-gray-600" />
              <span>ASK_ME (Default)</span>
            </div>
            <p className="text-gray-500 mt-1 text-[11px]">
              Gate chimes your app for instant 1-tap approval before letting the agent enter.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white border border-gray-200/80">
            <div className="font-bold text-emerald-700 flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4 text-emerald-600" />
              <span>ALLOW_TO_DOOR</span>
            </div>
            <p className="text-gray-500 mt-1 text-[11px]">
              Auto-approves verified delivery agent to walk directly up to your apartment door.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white border border-gray-200/80">
            <div className="font-bold text-amber-700 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-amber-600" />
              <span>LEAVE_AT_GATE</span>
            </div>
            <p className="text-gray-500 mt-1 text-[11px]">
              Instructs security to accept and store the package at the main gate reception.
            </p>
          </div>
        </div>
      </div>

      {/* 7 Platform Cards */}
      {isLoading ? (
        <TableSkeleton columns={3} rows={4} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PLATFORMS.map((platform) => {
            const rule = rules[platform.key];
            const isSaving = savingPlatform === platform.key;

            return (
              <div
                key={platform.key}
                className={`card p-5 border-2 transition-all flex flex-col justify-between gap-5 relative overflow-hidden ${
                  rule.mode === 'ALLOW_TO_DOOR'
                    ? 'border-emerald-200/90 bg-gradient-to-b from-white to-emerald-50/20'
                    : rule.mode === 'LEAVE_AT_GATE'
                    ? 'border-amber-200/90 bg-gradient-to-b from-white to-amber-50/20'
                    : 'border-gray-200/90 bg-white'
                }`}
              >
                {/* Header with Platform Identity */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base shadow-xs shrink-0 ${platform.iconBg}`}
                    >
                      <Truck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-gray-900">{platform.name}</h3>
                      <p className="text-[11px] text-gray-500">{platform.category}</p>
                    </div>
                  </div>

                  <Badge
                    variant={
                      rule.mode === 'ALLOW_TO_DOOR'
                        ? 'success'
                        : rule.mode === 'LEAVE_AT_GATE'
                        ? 'warning'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {rule.mode.replace(/_/g, ' ')}
                  </Badge>
                </div>

                {/* Mode Selector Radio Pills */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                    Access Permission Mode
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => updateField(platform.key, 'mode', 'ASK_ME')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                        rule.mode === 'ASK_ME'
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Ask Me
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField(platform.key, 'mode', 'ALLOW_TO_DOOR')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                        rule.mode === 'ALLOW_TO_DOOR'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      To Door
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField(platform.key, 'mode', 'LEAVE_AT_GATE')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                        rule.mode === 'LEAVE_AT_GATE'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      At Gate
                    </button>
                  </div>
                </div>

                {/* Time Window Selectors */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>Auto-Allow Active Window</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-gray-400 block mb-0.5">Start Time</span>
                      <input
                        type="time"
                        value={rule.windowStart}
                        onChange={(e) => updateField(platform.key, 'windowStart', e.target.value)}
                        className="input-base !py-1 !px-2 text-xs w-full font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block mb-0.5">End Time</span>
                      <input
                        type="time"
                        value={rule.windowEnd}
                        onChange={(e) => updateField(platform.key, 'windowEnd', e.target.value)}
                        className="input-base !py-1 !px-2 text-xs w-full font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Silent Alert Toggle & Save Action */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rule.silent}
                      onChange={(e) => updateField(platform.key, 'silent', e.target.checked)}
                      className="rounded border-gray-300 text-[#cd0447] focus:ring-[#cd0447]"
                    />
                    <span className="flex items-center gap-1">
                      {rule.silent ? (
                        <VolumeX className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-[#cd0447]" />
                      )}
                      <span>Silent Alert</span>
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveRule(platform.key)}
                    className="btn-primary !text-xs !py-1.5 !px-3 flex items-center gap-1.5"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeliveriesPage;
