import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Context Hooks
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';

// UI State Components
import { CenteredSpinner } from '../components/ui/States';

// Layouts & Protection
import { DashboardLayout, GuardKioskLayout } from '../components/layout';
import { ProtectedRoute } from './ProtectedRoute';

// Public & Auth Pages
import { LoginPage, ChangePasswordPage } from '../pages/auth';
import { NotFoundPage } from '../pages/NotFoundPage';

// Superadmin Pages
import {
  OverviewPage as SuperadminOverviewPage,
  SocietiesPage as SuperadminSocietiesPage,
  DevicesPage as SuperadminDevicesPage,
} from '../pages/superadmin';

// Society Admin Pages
import {
  DashboardPage as AdminDashboardPage,
  UnitsPage as AdminUnitsPage,
  UsersPage as AdminUsersPage,
  StaffPage as AdminStaffPage,
  GateLogsPage as AdminGateLogsPage,
  DevicesPage as AdminDevicesPage,
  GatesPage as AdminGatesPage,
  NoticesPage as AdminNoticesPage,
  ComplaintsPage as AdminComplaintsPage,
} from '../pages/admin';

// Resident Pages
import {
  DashboardPage as ResidentDashboardPage,
  ApprovalsPage as ResidentApprovalsPage,
  StaffPage as ResidentStaffPage,
  DeliveriesPage as ResidentDeliveriesPage,
  PasscodesPage as ResidentPasscodesPage,
  ActivityPage as ResidentActivityPage,
  CommunityPage as ResidentCommunityPage,
} from '../pages/resident';

// Guard Pages
import { KioskPage as GuardKioskPage } from '../pages/guard';

/**
 * Handles root route redirection based on authentication state and active role context.
 */
const RootRedirect: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { getPrimaryRedirectPath, isLoadingContexts } = useRole();

  if (isLoading || (isAuthenticated && isLoadingContexts)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <CenteredSpinner label="Loading workspace..." size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={getPrimaryRedirectPath()} replace />;
  }

  return <Navigate to="/login" replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* 1. Public Authentication Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* 2. Mandatory Password Change Route (Protected) */}
      <Route
        path="/force-change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />

      {/* 3. Superadmin Hierarchy (Scoped to Superadmin only) */}
      <Route
        element={
          <ProtectedRoute requireSuperadmin>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/superadmin/overview" element={<SuperadminOverviewPage />} />
        <Route path="/superadmin/societies" element={<SuperadminSocietiesPage />} />
        <Route path="/superadmin/devices" element={<SuperadminDevicesPage />} />
      </Route>

      {/* 4. Society Admin Hierarchy (Scoped to SOCIETY and GLOBAL) */}
      <Route
        element={
          <ProtectedRoute allowedScopes={['SOCIETY', 'GLOBAL']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/units" element={<AdminUnitsPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/staff" element={<AdminStaffPage />} />
        <Route path="/admin/gate-logs" element={<AdminGateLogsPage />} />
        <Route path="/admin/devices" element={<AdminDevicesPage />} />
        <Route path="/admin/gates" element={<AdminGatesPage />} />
        <Route path="/admin/notices" element={<AdminNoticesPage />} />
        <Route path="/admin/complaints" element={<AdminComplaintsPage />} />
      </Route>

      {/* 5. Resident Hierarchy (Scoped to UNIT and GLOBAL) */}
      <Route
        element={
          <ProtectedRoute allowedScopes={['UNIT', 'GLOBAL']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/resident/dashboard" element={<ResidentDashboardPage />} />
        <Route path="/resident/approvals" element={<ResidentApprovalsPage />} />
        <Route path="/resident/staff" element={<ResidentStaffPage />} />
        <Route path="/resident/deliveries" element={<ResidentDeliveriesPage />} />
        <Route path="/resident/passcodes" element={<ResidentPasscodesPage />} />
        <Route path="/resident/activity" element={<ResidentActivityPage />} />
        <Route path="/resident/community" element={<ResidentCommunityPage />} />
      </Route>

      {/* 6. Guard Gate Kiosk Hierarchy (Scoped to GATE and GLOBAL) */}
      <Route
        element={
          <ProtectedRoute allowedScopes={['GATE', 'GLOBAL']}>
            <GuardKioskLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/guard/kiosk" element={<GuardKioskPage />} />
      </Route>

      {/* 7. Root Entrypoint Auto-Redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* 8. Fallback / 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
