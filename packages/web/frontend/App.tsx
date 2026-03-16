import { Routes, Route } from 'react-router-dom';
import { Layout } from './react-components/Layout';
import { ProtectedRoute } from './react-components/ProtectedRoute';
import { HomePage } from './react-pages/HomePage';
import { LoginPage } from './react-pages/LoginPage';
import { DashboardPage } from './react-pages/DashboardPage';
import { AircraftPage } from './react-pages/AircraftPage';
import { HangarsPage } from './react-pages/HangarsPage';
import { SchedulePage } from './react-pages/SchedulePage';
import { TimelinePage } from './react-pages/TimelinePage';
import { EditorPage } from './react-pages/EditorPage';
import { ResultsPage } from './react-pages/ResultsPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/results" element={<ResultsPage />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/aircraft" element={<ProtectedRoute><AircraftPage /></ProtectedRoute>} />
        <Route path="/hangars" element={<ProtectedRoute><HangarsPage /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><SchedulePage /></ProtectedRoute>} />
        <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
