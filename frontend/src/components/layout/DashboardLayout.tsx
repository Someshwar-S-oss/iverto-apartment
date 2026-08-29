import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import IncomingApprovalModal from '../real-time/IncomingApprovalModal';

export interface DashboardLayoutProps {
  children?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#fafafa] to-[#f5f5f5]">
      {/* Dynamic Navigation Sidebar */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <Topbar onMobileMenuToggle={() => setIsMobileMenuOpen((prev) => !prev)} />

        {/* Dynamic Route Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in-up overflow-x-hidden">
          {children || <Outlet />}
        </main>
      </div>

      {/* Global Real-time Incoming Visitor Ring Modal */}
      <IncomingApprovalModal />
    </div>
  );
};

export default DashboardLayout;
