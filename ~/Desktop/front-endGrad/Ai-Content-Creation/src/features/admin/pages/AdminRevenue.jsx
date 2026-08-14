import { useState, useEffect } from 'react'
import { useAdminApi } from '@/hooks/useAdminApi'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableCell, TableBody } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'

export function AdminRevenue() {
  const { user } = useAuth()
  const { data: overview, isLoading, refetch } = useAdminApi('/dashboard/revenue', {})

  if (user?.role !== 'admin') {
    return <div className="p-6">Access denied. Admin role required.</div>
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Revenue Analytics</h2>

      {isLoading ? (
        <div>Loading revenue data...</div>
      ) : overview ? (
        <div>
          <Button onClick={refetch} variant="secondary" className="mb-4">
            Refresh
          </Button>
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell>Metric</TableCell>
                <TableCell>Value</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Total Revenue</TableCell>
                <TableCell>{overview.revenueTotal}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Monthly Revenue</TableCell>
                <TableCell>{overview.revenueMonthly}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Yearly Revenue</TableCell>
                <TableCell>{overview.revenueYearly}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Successful Payments</TableCell>
                <TableCell>{overview.successfulPayments}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Average Payment</TableCell>
                <TableCell>{overview.averagePayment}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div>No revenue data found</div>
      )}
    </div>
  )
}