export * from './auth';
export * from './superadmin';
export * from './resident';
export * from './guard';
export * from './NotFoundPage';
export { default as NotFoundPage } from './NotFoundPage';
export {
  DashboardPage as AdminDashboardPage,
  UnitsPage,
  UsersPage,
  StaffPage as AdminStaffPage,
  GateLogsPage,
  DevicesPage as AdminDevicesPage,
  NoticesPage,
  ComplaintsPage,
} from './admin';
