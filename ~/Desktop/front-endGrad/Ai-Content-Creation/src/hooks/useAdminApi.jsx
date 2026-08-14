import { useQuery } from '@tanstack/react-query'
import { adminFetch } from '@/lib/adminApi'

export function useAdminApi(path, options = {}) {
  return useQuery({
    queryKey: ['admin', path, options],
    queryFn: async () => {
      const result = await adminFetch(path, options)
      return result
    },
    staleTime: 30000,
    retry: 2,
  })
}