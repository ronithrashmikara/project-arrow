import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import VerifierDashboard from "./pages/verifier/VerifierDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root to the verifier queue */}
        <Route path="/" element={<Navigate to="/verifier/queue" replace />} />
        
        {/* Verifier Dashboard Routes */}
        <Route path="/verifier" element={<DashboardLayout />}>
          <Route path="queue" element={<VerifierDashboard />} />
          
          {/* Placeholders for other tabs */}
          <Route path="leaderboard" element={<div className="text-soft-glass p-8">Leaderboard coming soon...</div>} />
          <Route path="badges" element={<div className="text-soft-glass p-8">Badges coming soon...</div>} />
          <Route path="checklist" element={<div className="text-soft-glass p-8">Checklist coming soon...</div>} />
          <Route path="history" element={<div className="text-soft-glass p-8">History coming soon...</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}