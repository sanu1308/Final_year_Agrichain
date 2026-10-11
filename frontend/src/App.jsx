import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Web3Provider } from './context/Web3Context';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { FarmerDashboard } from './pages/FarmerDashboard';
import { DistributorDashboard } from './pages/DistributorDashboard';
import { RetailerDashboard } from './pages/RetailerDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { ConsumerVerifyPage } from './pages/ConsumerVerifyPage';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Checking authentication...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role) && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Web3Provider>
          <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
            <Navbar />
            <main className="flex-grow">
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/verify/:batchId" element={<ConsumerVerifyPage />} />

                {/* Role Protected Dashboards */}
                <Route
                  path="/farmer"
                  element={
                    <ProtectedRoute allowedRoles={['FARMER', 'ADMIN']}>
                      <FarmerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/distributor"
                  element={
                    <ProtectedRoute allowedRoles={['DISTRIBUTOR', 'ADMIN']}>
                      <DistributorDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/retailer"
                  element={
                    <ProtectedRoute allowedRoles={['RETAILER', 'ADMIN']}>
                      <RetailerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN']}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </Web3Provider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
