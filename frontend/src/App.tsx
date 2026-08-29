import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider, AuthProvider, RoleProvider, RealtimeProvider } from './context';
import { AppRoutes } from './routes';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RoleProvider>
            <RealtimeProvider>
              <AppRoutes />
            </RealtimeProvider>
          </RoleProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
