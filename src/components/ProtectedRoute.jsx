import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-screen">
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
