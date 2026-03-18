import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AnalysisProvider } from './context/AnalysisContext';
import { NotificationProvider } from './context/NotificationContext';
import { App } from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <NotificationProvider>
        <AuthProvider>
          <AnalysisProvider>
            <App />
          </AnalysisProvider>
        </AuthProvider>
      </NotificationProvider>
    </HashRouter>
  </StrictMode>
);
