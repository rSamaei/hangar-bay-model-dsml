import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AircraftPage } from './pages/AircraftPage';
import { HangarsPage } from './pages/HangarsPage';
import { SchedulePage } from './pages/SchedulePage';
import { TimelinePage } from './pages/TimelinePage';
import { EditorPage } from './pages/EditorPage';
import { ResultsPage } from './pages/ResultsPage';

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
