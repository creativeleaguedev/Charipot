import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import OAuthConsent from '@/pages/OAuthConsent';
import Home from '@/pages/Home';
import Landing from '@/pages/Landing';
import Play from '@/pages/Play';
import Dashboard from '@/pages/Dashboard';
import Marketplace from '@/pages/Marketplace';
import Projects from '@/pages/Projects';
import AgentPortal from '@/pages/AgentPortal';
import ClubPanel from '@/pages/ClubPanel';
import AdminCenter from '@/pages/AdminCenter';
import ConfigRegistry from '@/pages/ConfigRegistry';
import AuditLog from '@/pages/AuditLog';
import CryptoWallet from '@/pages/CryptoWallet';
import Donate from '@/pages/Donate';
import Contracts from '@/pages/Contracts';
import Wallets from '@/pages/Wallets';
import TicketMarketplace from '@/pages/TicketMarketplace';
import Support from '@/pages/Support';
import FundingRounds from '@/pages/FundingRounds';
import ProofPage from '@/pages/ProofPage';
import PassHistory from '@/pages/PassHistory';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="/" element={<Landing />} />
      <Route path="/wallets" element={<Wallets />} />
      <Route path="/proof/:drawNumber" element={<ProofPage />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/funding-rounds" element={<FundingRounds />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/agent" element={<AgentPortal />} />
          <Route path="/club" element={<ClubPanel />} />
          <Route path="/admin" element={<AdminCenter />} />
          <Route path="/config" element={<ConfigRegistry />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/wallet" element={<CryptoWallet />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/passes" element={<TicketMarketplace />} />
          <Route path="/pass-history" element={<PassHistory />} />
          <Route path="/pass-history/:userId" element={<PassHistory />} />
          <Route path="/support" element={<Support />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App