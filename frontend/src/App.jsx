import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Landing from './pages/Landing'
import UserDashboard from './pages/UserDashboard'
import AdminDashboard from './pages/AdminDashboard'
import EventDetail from './pages/EventDetail'
import TeamHub from './pages/TeamHub'
import Support from './pages/Support'
import Gallery from './pages/Gallery'
import SubmissionEditor from './pages/SubmissionEditor'
import JudgeDashboard from './pages/JudgeDashboard'
import Profile from './pages/Profile'

function RequireAuth({ role, children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-10 text-slate-400">Loading…</div>
  if (!user) return <Navigate to="/" state={{ scrollTo: 'login' }} replace />
  if (role && user.role !== role)
    return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <UserDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <AdminDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/event/:slug"
            element={
              <RequireAuth>
                <EventDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/event/:slug/teams"
            element={
              <RequireAuth>
                <TeamHub />
              </RequireAuth>
            }
          />
          <Route
            path="/event/:slug/gallery"
            element={
              <RequireAuth>
                <Gallery />
              </RequireAuth>
            }
          />
          <Route
            path="/event/:slug/submit"
            element={
              <RequireAuth>
                <SubmissionEditor />
              </RequireAuth>
            }
          />
          <Route
            path="/judge"
            element={
              <RequireAuth>
                <JudgeDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route path="/support" element={<Support />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
