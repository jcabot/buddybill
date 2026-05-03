import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from './components/AuthGate.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/Login.js';
import { SignupPage } from './pages/Signup.js';
import { DashboardPage } from './pages/Dashboard.js';
import { GroupDetailPage } from './pages/GroupDetail.js';
import { ActivityDetailPage } from './pages/ActivityDetail.js';
import { InvoiceFormPage } from './pages/InvoiceForm.js';
import { GroupSettingsPage } from './pages/Settings.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <AppShell>
              <DashboardPage />
            </AppShell>
          </AuthGate>
        }
      />
      <Route
        path="/groups/:gid"
        element={
          <AuthGate>
            <AppShell>
              <GroupDetailPage />
            </AppShell>
          </AuthGate>
        }
      />
      <Route
        path="/groups/:gid/activities/:aid"
        element={
          <AuthGate>
            <AppShell>
              <ActivityDetailPage />
            </AppShell>
          </AuthGate>
        }
      />
      <Route
        path="/groups/:gid/activities/:aid/invoices/new"
        element={
          <AuthGate>
            <AppShell>
              <InvoiceFormPage mode="create" />
            </AppShell>
          </AuthGate>
        }
      />
      <Route
        path="/groups/:gid/activities/:aid/invoices/:iid/edit"
        element={
          <AuthGate>
            <AppShell>
              <InvoiceFormPage mode="edit" />
            </AppShell>
          </AuthGate>
        }
      />
      <Route
        path="/groups/:gid/settings"
        element={
          <AuthGate>
            <AppShell>
              <GroupSettingsPage />
            </AppShell>
          </AuthGate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
