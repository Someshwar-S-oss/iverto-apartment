import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Cpu,
  Home,
  Users,
  UserCheck,
  History,
  Megaphone,
  MessageSquareWarning,
  CheckCircle2,
  Package,
  KeyRound,
  Activity,
  ShieldCheck,
  DoorOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { BRAND_CONFIG } from '../../constants/branding';

export const SIDEBAR_COLLAPSED_KEY = 'iverto.sidebar.collapsed';

export interface NavItemConfig {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen = false,
  onMobileClose,
  isCollapsed: externalCollapsed,
  onToggleCollapse: externalToggleCollapse,
}) => {
  const location = useLocation();
  const { activeContext } = useRole();
  const { user } = useAuth();

  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  const isCollapsed =
    externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (externalToggleCollapse) {
      externalToggleCollapse();
    } else {
      const next = !internalCollapsed;
      setInternalCollapsed(next);
      if (typeof window !== 'undefined') {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      }
    }
  };

  // Close mobile drawer on route change
  useEffect(() => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose();
    }
  }, [location.pathname]);

  // Determine navigation items based on active context and role
  const getNavItems = (): { section: string; items: NavItemConfig[] }[] => {
    if (user?.isSuperadmin && (!activeContext || activeContext.type === 'GLOBAL')) {
      return [
        {
          section: 'Platform Administration',
          items: [
            {
              label: 'Global Overview',
              path: '/superadmin/overview',
              icon: LayoutDashboard,
            },
            {
              label: 'Client Societies',
              path: '/superadmin/societies',
              icon: Building2,
            },
            {
              label: 'Device Inventory',
              path: '/superadmin/devices',
              icon: Cpu,
            },
          ],
        },
      ];
    }

    if (activeContext?.type === 'SOCIETY') {
      return [
        {
          section: 'Society Management',
          items: [
            {
              label: 'Dashboard',
              path: '/admin/dashboard',
              icon: LayoutDashboard,
            },
            {
              label: 'Buildings & Units',
              path: '/admin/units',
              icon: Layers,
            },
            {
              label: 'Users & Residents',
              path: '/admin/users',
              icon: Users,
            },
            {
              label: 'Domestic Staff',
              path: '/admin/staff',
              icon: UserCheck,
            },
            {
              label: 'Gate Logs',
              path: '/admin/gate-logs',
              icon: History,
            },
            {
              label: 'Devices & Bridges',
              path: '/admin/devices',
              icon: Cpu,
            },
            {
              label: 'Gates',
              path: '/admin/gates',
              icon: DoorOpen,
            },
            {
              label: 'Notices',
              path: '/admin/notices',
              icon: Megaphone,
            },
            {
              label: 'Complaints',
              path: '/admin/complaints',
              icon: MessageSquareWarning,
            },
          ],
        },
      ];
    }

    if (activeContext?.type === 'GATE') {
      return [
        {
          section: 'Security & Access',
          items: [
            {
              label: 'Gate Kiosk',
              path: '/guard/kiosk',
              icon: ShieldCheck,
            },
          ],
        },
      ];
    }

    // Default: Resident unit context
    return [
      {
        section: 'My Residence',
        items: [
          {
            label: 'Home Overview',
            path: '/resident/dashboard',
            icon: Home,
          },
          {
            label: 'Approvals',
            path: '/resident/approvals',
            icon: CheckCircle2,
          },
          {
            label: 'Domestic Staff',
            path: '/resident/staff',
            icon: Sparkles,
          },
          {
            label: 'Deliveries',
            path: '/resident/deliveries',
            icon: Package,
          },
          {
            label: 'Guest Passcodes',
            path: '/resident/passcodes',
            icon: KeyRound,
          },
          {
            label: 'Unit Activity',
            path: '/resident/activity',
            icon: Activity,
          },
          {
            label: 'Community',
            path: '/resident/community',
            icon: Megaphone,
          },
        ],
      },
    ];
  };

  const navGroups = getNavItems();

  const sidebarContent = (
    <div className="flex h-full flex-col select-none border-r border-[var(--line)] bg-[var(--ink-50)]">
      {/* Brand Header */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-[var(--line)] bg-white px-4 ${
          isCollapsed ? 'justify-center px-2' : 'justify-between'
        }`}
      >
        {isCollapsed ? (
          <img
            src={BRAND_CONFIG.logoIcon}
            alt={BRAND_CONFIG.name}
            className="h-9 w-9 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = BRAND_CONFIG.logoIconLocal;
            }}
          />
        ) : (
          <img
            src={BRAND_CONFIG.logoFull}
            alt={BRAND_CONFIG.name}
            className="h-8 max-w-[170px] object-contain object-left"
            onError={(e) => {
              (e.target as HTMLImageElement).src = BRAND_CONFIG.logoFullLocal;
            }}
          />
        )}

        {/* Mobile close button */}
        {isMobileOpen && onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="icon-btn md:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="scrollbar-none flex-1 space-y-7 overflow-y-auto px-3 py-5">
        {navGroups.map((group, groupIdx) => (
          <div key={`nav-group-${groupIdx}`} className="space-y-1">
            {group.section &&
              (isCollapsed ? (
                <div className="mx-auto mb-3 h-px w-7 bg-[var(--line-strong)]" aria-hidden="true" />
              ) : (
                <div className="mb-2.5 flex items-center gap-2.5 px-2">
                  <span className="eyebrow whitespace-nowrap text-[10px]">
                    {group.section}
                  </span>
                  <span className="h-px flex-1 bg-[var(--line)]" aria-hidden="true" />
                </div>
              ))}

            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-[var(--r-md)] px-3 py-2.5 text-sm transition-all duration-200 ${
                      isCollapsed ? 'justify-center px-2' : ''
                    } ${
                      isActive
                        ? 'bg-white font-semibold text-[var(--brand)] shadow-[var(--e2)] ring-1 ring-[var(--line)]'
                        : 'font-medium text-[var(--ink-600)] hover:bg-white/70 hover:text-[var(--ink-900)]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active rail — a brand tick on the leading edge */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#cd0447] to-[#e91e63]"
                          aria-hidden="true"
                        />
                      )}

                      <Icon
                        className={`h-[1.15rem] w-[1.15rem] shrink-0 transition-colors ${
                          isActive
                            ? 'text-[var(--brand)] stroke-[2.1]'
                            : 'text-[var(--ink-400)] group-hover:text-[var(--ink-700)]'
                        }`}
                      />
                      {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!isCollapsed && item.badge !== undefined && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            isActive
                              ? 'bg-[var(--brand-50)] text-[var(--brand)]'
                              : 'bg-[var(--ink-200)] text-[var(--ink-600)]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}

                      {/* Tooltip for collapsed state */}
                      {isCollapsed && (
                        <div className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-[var(--r-xs)] bg-[var(--ink-900)] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-[var(--e3)] transition-opacity group-hover:opacity-100">
                          {item.label}
                        </div>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      {/* Collapse Toggle Footer for Desktop */}
      <div className="hidden shrink-0 border-t border-[var(--line)] p-3 md:block">
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--r-sm)] p-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-500)] transition-colors hover:bg-white hover:text-[var(--ink-900)]"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:block shrink-0 h-screen sticky top-0 transition-all duration-300 z-30 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
          isMobileOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-[var(--ink-900)]/45 backdrop-blur-sm transition-opacity duration-300 ${
            isMobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onMobileClose}
          aria-hidden="true"
        />

        {/* Sliding Panel */}
        <div
          className={`relative h-full w-72 max-w-[82vw] shadow-[var(--e4)] transition-transform duration-300 ease-out ${
            isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
