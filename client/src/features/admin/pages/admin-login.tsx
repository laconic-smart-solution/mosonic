import { Navigate } from "react-router-dom"

/** Legacy URL: use `/login?next=/admin`. */
export default function AdminLoginPage() {
  return <Navigate to="/login?next=/admin" replace />
}
