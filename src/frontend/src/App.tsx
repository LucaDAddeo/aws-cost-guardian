import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AppProvider } from './context/AppContext';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/AuthProvider';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Notification } from './components/Notification';

export function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Notification />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppProvider>
    </AuthProvider>
  );
}
