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
    <div className="min-h-screen flex bg-[var(--canvas)]">
      {/* Dynamic Navigation Sidebar */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <Topbar onMobileMenuToggle={() => setIsMobileMenuOpen((prev) => !prev)} />

        {/* Dynamic Route Content — sits on a faint dot field so the workspace
            reads as a surface rather than an empty white void. */}
        <main className="relative flex-1 overflow-x-hidden">
          <div
            className="bg-field bg-field-dots field-fade-top"
            style={{
              ['--field-size' as string]: '26px',
              ['--field-dot' as string]: 'rgba(20, 22, 26, 0.07)',
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8 animate-fade-in-up">
            {children || <Outlet />}
          </div>
        </main>
      </div>

      {/* Global Real-time Incoming Visitor Ring Modal */}
      <IncomingApprovalModal />
    </div>
  );
};

export default DashboardLayout;
