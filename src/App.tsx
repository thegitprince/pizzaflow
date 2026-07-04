/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import StaffLoginPage from "./app/staff/login/page";
import StaffOrderPage from "./app/staff/order/page";
import AdminLoginPage from "./app/admin/login/page";
import AdminMenuPage from "./app/admin/menu/page";
import AdminDashboardPage from "./app/admin/dashboard/page";
import CustomerTablePage from "./app/table/[tableId]/page";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route redirecting to staff login */}
        <Route path="/" element={<Navigate to="/staff/login" replace />} />

        {/* Staff Routes */}
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route path="/staff/order" element={<StaffOrderPage />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/menu" element={<AdminMenuPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />

        {/* Customer Self-Ordering Placeholder Route */}
        <Route path="/table/:tableId" element={<CustomerTablePage />} />

        {/* Catch-all fallback redirect */}
        <Route path="*" element={<Navigate to="/staff/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

