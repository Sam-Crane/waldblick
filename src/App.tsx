import { Route, Routes } from 'react-router-dom';
import AppShell from '@/components/Layout/AppShell';
import AuthGuard from '@/components/Layout/AuthGuard';
import UpdatePrompt from '@/components/UpdatePrompt';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';
import { useSyncDriver } from '@/data/syncEngine';
import { useRealtimeSync } from '@/data/realtimeSync';
import SplashScreen from '@/screens/SplashScreen';
import MapScreen from '@/screens/MapScreen';
import AddObservation from '@/screens/AddObservation';
import TaskList from '@/screens/TaskList';
import ObservationDetails from '@/screens/ObservationDetails';
import NavigateTo from '@/screens/NavigateTo';
import Dashboard from '@/screens/Dashboard';
import Profile from '@/screens/Profile';
import Settings from '@/screens/Settings';
import Messages from '@/screens/Messages';
import Conversation from '@/screens/Conversation';
import Connect from '@/screens/Connect';
import Plots from '@/screens/Plots';
import PlotEditor from '@/screens/PlotEditor';
import SignIn from '@/screens/auth/SignIn';
import SignUp from '@/screens/auth/SignUp';
import ForgotPassword from '@/screens/auth/ForgotPassword';
import ResetPassword from '@/screens/auth/ResetPassword';

export default function App() {
  useSyncDriver();
  useRealtimeSync();
  return (
    <ErrorBoundary>
      <ToastProvider>
      <UpdatePrompt />
      <Routes>
        <Route index element={<SplashScreen />} />

        {/* Public auth routes */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Authenticated app */}
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/map" element={<MapScreen />} />
            <Route path="/record" element={<AddObservation />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/observations/:id" element={<ObservationDetails />} />
            <Route path="/observations/:id/navigate" element={<NavigateTo />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:id" element={<Conversation />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/plots" element={<Plots />} />
            <Route path="/plots/new" element={<PlotEditor />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
      </ToastProvider>
    </ErrorBoundary>
  );
}
