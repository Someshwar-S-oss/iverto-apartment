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
    <div className="flex flex-col h-full bg-white/95 backdrop-blur-xl border-r border-gray-200/80 select-none shadow-sm transition-all duration-300">
      {/* Brand Header */}
      <div
        className={`h-16 flex items-center px-4 border-b border-gray-100/90 ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {isCollapsed ? (
          <div className="flex items-center justify-center">
            <img
              src={BRAND_CONFIG.logoIcon}
              alt={BRAND_CONFIG.name}
              className="w-9 h-9 object-contain drop-shadow-xs transition-transform duration-200 hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = BRAND_CONFIG.logoIconLocal;
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src={BRAND_CONFIG.logoFull}
              alt={BRAND_CONFIG.name}
              className="h-8 max-w-[170px] object-contain object-left drop-shadow-xs transition-all duration-200"
              onError={(e) => {
                (e.target as HTMLImageElement).src = BRAND_CONFIG.logoFullLocal;
              }}
            />
          </div>
        )}

        {/* Mobile close button */}
        {isMobileOpen && onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden icon-btn text-gray-500 hover:text-gray-900"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-none">
        {navGroups.map((group, groupIdx) => (
          <div key={`nav-group-${groupIdx}`} className="space-y-1">
            {!isCollapsed && group.section && (
              <div className="px-3 pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isCollapsed ? 'justify-center px-2' : ''
                    } ${
                      isActive
                        ? 'bg-gradient-to-r from-[#cd0447] to-[#e91e63] text-white shadow-md shadow-[#cd0447]/25 font-semibold'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-900'
                        }`}
                      />
                      {!isCollapsed && (
                        <span className="truncate flex-1">{item.label}</span>
                      )}
                      {!isCollapsed && item.badge !== undefined && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-[#cd0447]/10 text-[#cd0447]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}

                      {/* Tooltip for collapsed state */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
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
      <div className="hidden md:flex p-3 border-t border-gray-100/90 justify-center">
        <button
          type="button"
          onClick={toggleCollapse}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer text-xs font-medium"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse Sidebar</span>
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
          className={`fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 ${
            isMobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onMobileClose}
          aria-hidden="true"
        />

        {/* Sliding Panel */}
        <div
          className={`relative w-72 max-w-[80vw] h-full shadow-2xl transition-transform duration-300 ease-out ${
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
