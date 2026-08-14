import { useAuth } from '@/contexts/AuthContext'
import { useAdminApi } from '@/hooks/useAdminApi'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

export function AdminDashboard() {
  const { user } = useAuth()
  const { data: overview } = useAdminApi('/dashboard/revenue', {})

  // Check admin role
  const isAdmin = user?.role === 'admin'

  if (!isAdmin) {
    return <div className="p-6">Access denied. Admin role required.</div>
  }

  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background p-6">
      <header className="mb-6">
        <h2 className="text-xl font-semibold">
          Admin Dashboard - {user?.name || 'Admin'}
        </h2>
        <Button
          onClick={() => navigate('/')}
          className="ml-auto"
          variant="outline"
        >
          Home
        </Button>
      </header>

      <nav className="mb-6">
        <ul className="grid grid-cols-2 gap-2">
          <li>
            <Button onClick={() => navigate('/admin')} variant="default">
              Overview
            </Button>
          </li>
          <li>
            <Button onClick={() => navigate('/admin/users')} variant="outline">
              Users
            </Button>
          </li>
          <li>
            <Button onClick={() => navigate('/admin/revenue')} variant="outline">
              Revenue
            </Button>
          </li>
          <li>
            <Button onClick={() => navigate('/admin/credits')} variant="outline">
              Credit Events
            </Button>
          </li>
          <li>
            <Button onClick={() => navigate('/admin/workflows')} variant="outline">
              Workflow Executions
            </Button>
          </li>
          <li>
            <Button onClick={() => navigate('/admin/emails')} variant="outline">
              Email Management
            </Button>
          </li>
        </ul>
      </nav>

      <main className="p-6">
        {navigate('/admin') === '/admin' && <AdminDashboardOverview />}
        {navigate('/admin/users') === '/admin/users' && <div>Users Page</div>}
        {navigate('/admin/revenue') === '/admin/revenue' && <div>Revenue Page</div>}
        {navigate('/admin/credits') === '/admin/credits' && <div>Credits Page</div>}
        {navigate('/admin/workflows') === '/admin/workflows' && <div>Workflows Page</div>}
        {navigate('/admin/emails') === '/admin/emails' && <div>Emails Page</div>}
        <p>Admin Dashboard - Navigate using the sidebar</p>
      </main>
    </div>
  )
}