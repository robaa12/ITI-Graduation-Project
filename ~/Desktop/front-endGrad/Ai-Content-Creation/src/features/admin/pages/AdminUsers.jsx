import { useState, useEffect } from 'react'
import { useAdminApi } from '@/hooks/useAdminApi'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableCell, TableBody } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'

export function AdminUsers() {
  const { user } = useAuth()
  const { data: users, isLoading, refetch } = useAdminApi('/users', { page: 1, limit: 10 })

  if (user?.role !== 'admin') {
    return <div className="p-6">Access denied. Admin role required.</div>
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">User Management</h2>

      {isLoading ? (
        <div>Loading users...</div>
      ) : users.data ? (
        <div>
          <Button onClick={refetch} variant="secondary" className="mb-4">
            Refresh
          </Button>
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.alert(`View user ${user.id}`)}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => window.alert(`Delete user ${user.id}`)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-4 text-sm text-muted-foreground">
            Total: {users.meta?.total || 0} users, Page {users.meta?.page || 1} of{
            users.meta?.totalPages || 1}
          </p>
        </div>
      ) : (
        <div>No users found</div>
      )}
    </div>
  )
}