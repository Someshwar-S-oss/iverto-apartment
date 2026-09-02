import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider, AuthProvider, RoleProvider, RealtimeProvider, CacheProvider } from './context';
import { AppRoutes } from './routes';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <CacheProvider>
        <ToastProvider>
          <AuthProvider>
            <RoleProvider>
              <RealtimeProvider>
                <AppRoutes />
              </RealtimeProvider>
            </RoleProvider>
          </AuthProvider>
        </ToastProvider>
      </CacheProvider>
    </BrowserRouter>
  );
};

export default App;
