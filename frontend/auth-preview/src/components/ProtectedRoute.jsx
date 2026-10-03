import { Navigate } from "react-router-dom";

/*
  Optional helper for your project.

  Example:
  <ProtectedRoute allowedRoles={["admin"]}>
    <AdminDashboard />
  </ProtectedRoute>

  The role should come from the authenticated user returned
  by your backend, never from the login form.
*/

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const rawUser = localStorage.getItem("user");
  const user = rawUser ? JSON.parse(rawUser) : null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
