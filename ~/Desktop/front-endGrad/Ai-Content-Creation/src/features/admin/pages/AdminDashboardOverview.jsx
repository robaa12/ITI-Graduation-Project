import { useState, useEffect } from 'react'
import { useAdminApi } from '@/hooks/useAdminApi'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui/card'
import { Button as ActionButton } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

export function AdminDashboardOverview() {
  const { user } = useAuth()
  const { data: overview, isLoading, refetch } = useAdminApi('/dashboard/revenue', {})

  const [stats, setStats] = useState({
    usersTotal: 0,
    usersActive: 0,
    projectsTotal: 0,
    projectsActive: 0,
    projectsArchived: 0,
    campaignsTotal: 0,
    campaignsDraft: 0,
    campaignsPublished: 0,
    contentTotal: 0,
    contentReady: 0,
    contentPending: 0,
    contentFailed: 0,
    strategiesPending: 0,
    strategiesRunning: 0,
    strategiesFailed: 0,
    subscriptionsActive: 0,
    revenueTotal: 0,
    revenueMonthly: 0,
    revenueYearly: 0,
    creditsConsumed: 0,
    creditsRefunded: 0,
    workflowsTotal: 0,
    workflowsSuccessful: 0,
    workflowsFailed: 0,
  })

  useEffect(() => {
    if (overview) {
      setStats({
        usersTotal: overview.users?.total || 0,
        usersActive: overview.users?.active || 0,
        projectsTotal: overview.projects?.total || 0,
        projectsActive: overview.projects?.active || 0,
        projectsArchived: overview.projects?.archived || 0,
        campaignsTotal: overview.campaigns?.total || 0,
        campaignsDraft: overview.campaigns?.draft || 0,
        campaignsPublished: overview.campaigns?.published || 0,
        contentTotal: overview.content?.total || 0,
        contentReady: overview.content?.ready || 0,
        contentPending: overview.content?.pending || 0,
        contentFailed: overview.content?.failed || 0,
        strategiesPending: overview.strategies?.pending || 0,
        strategiesRunning: overview.strategies?.running || 0,
        strategiesFailed: overview.strategies?.failed || 0,
        subscriptionsActive: overview.subscriptions?.active || 0,
        revenueTotal: overview.revenue?.total || 0,
        revenueMonthly: overview.revenue?.monthly || 0,
        revenueYearly: overview.revenue?.yearly || 0,
        creditsConsumed: overview.credits?.consumed || 0,
        creditsRefunded: overview.credits?.refunded || 0,
        workflowsTotal: overview.workflows?.total || 0,
        workflowsSuccessful: overview.workflows?.successful || 0,
        workflowsFailed: overview.workflows?.failed || 0,
      })
    }
  }, [overview])

  return (
    <div className="p-6">
      {user?.role !== 'admin' && (
        <div className="alert alert-error">
          <p>Access denied. Admin role required.</p>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Users */}
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>Total: {stats.usersTotal}</div>
              <div>Active: {stats.usersActive}</div>
            </div>
          </CardContent>
        </Card>

        {/* Projects */}
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>Total: {stats.projectsTotal}</div>
              <div>Active: {stats.projectsActive}</div>
              <div>Archived: {stats.projectsArchived}</div>
            </div>
          </CardContent>
        </Card>

        {/* Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>Total: {stats.campaignsTotal}</div>
              <div>Draft: {stats.campaignsDraft}</div>
              <div>Published: {stats.campaignsPublished}</div>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>Generated Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>Total: {stats.contentTotal}</div>
              <div>Ready: {stats.contentReady}</div>
              <div>Pending: {stats.contentPending}</div>
              <div>Failed: {stats.contentFailed}</div>
            </div>
          </CardContent>
        </Card>

        {/* Strategies */}
        <Card>
          <CardHeader>
            <CardTitle>Strategies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>Pending: {stats.strategiesPending}</div>
              <div>Running: {stats.strategiesRunning}</div>
              <div>Failed: {stats.strategiesFailed}</div>
            </div>
          </CardContent>
        </Card>

        {/* Subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div>Active: {stats.subscriptionsActive}</div>
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>Total: {stats.revenueTotal}</div>
              <div>Monthly: {stats.revenueMonthly}</div>
              <div>Yearly: {stats.revenueYearly}</div>
            </div>
          </CardContent>
        </Card>

        {/* Credits */}
        <Card>
          <CardHeader>
            <CardTitle>Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <div>Consumed: {stats.creditsConsumed}</div>
            <div>Refunded: {stats.creditsRefunded}</div>
          </CardContent>
        </Card>

        {/* Workflows */}
        <Card>
          <CardHeader>
            <CardTitle>Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>Total: {stats.workflowsTotal}</div>
              <div>Successful: {stats.workflowsSuccessful}</div>
              <div>Failed: {stats.workflowsFailed}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <ActionButton onClick={refetch} variant="secondary">
          Refresh Data
        </ActionButton>
      </div>
    </div>
  )
}