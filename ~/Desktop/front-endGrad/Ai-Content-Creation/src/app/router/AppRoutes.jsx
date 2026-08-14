import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { GuestRoute, ProtectedRoute } from '@/components/ProtectedRoute'
import { LoadingScreen } from '@/components/LoadingScreen'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { AdminDashboard } from '@/features/admin/pages/AdminDashboard'

const lazyPage = (loader, exportName) => lazy(async () => {
  const module = await loader()
  return { default: module[exportName] }
})

const LandingPage = lazyPage(() => import('@/features/landing/pages/LandingPage'), 'LandingPage')
const LoginPage = lazyPage(() => import('@/features/auth/pages/LoginPage'), 'LoginPage')
const RegisterPage = lazyPage(() => import('@/features/auth/pages/RegisterPage'), 'RegisterPage')
const VerifyEmailPage = lazyPage(() => import('@/features/auth/pages/VerifyEmailPage'), 'VerifyEmailPage')
const OtpLoginPage = lazyPage(() => import('@/features/auth/pages/OtpLoginPage'), 'OtpLoginPage')
const ForgotPasswordPage = lazyPage(() => import('@/features/auth/pages/ForgotPasswordPage'), 'ForgotPasswordPage')
const GeneratePage = lazyPage(() => import('@/features/generate/pages/GeneratePage'), 'GeneratePage')
const ConnectorsPage = lazyPage(() => import('@/features/connectors/pages/ConnectorsPage'), 'ConnectorsPage')
const PublishingPage = lazyPage(() => import('@/features/publishing/pages/PublishingPage'), 'PublishingPage')
const KnowledgePage = lazyPage(() => import('@/features/knowledge/pages/KnowledgePage'), 'KnowledgePage')
const SettingsPage = lazyPage(() => import('@/features/settings/pages/SettingsPage'), 'SettingsPage')
const BillingPage = lazyPage(() => import('@/features/billing/pages/BillingPage'), 'BillingPage')
const CheckoutPage = lazyPage(() => import('@/features/billing/pages/CheckoutPage'), 'CheckoutPage')
const AdminDashboardPage = lazyPage(() => import('@/features/admin/pages/AdminDashboard'), 'AdminDashboard')

const protect = (page) => <ProtectedRoute>{page}</ProtectedRoute>
const forGuests = (page) => <GuestRoute>{page}</GuestRoute>

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={forGuests(<LoginPage />)} />
        <Route path="/register" element={forGuests(<RegisterPage />)} />
        <Route path="/verify-email" element={forGuests(<VerifyEmailPage />)} />
        <Route path="/otp-login" element={forGuests(<OtpLoginPage />)} />
        <Route path="/forgot-password" element={forGuests(<ForgotPasswordPage />)} />
        <Route path="/generate" element={protect(<GeneratePage />)} />
        <Route path="/connectors" element={protect(<ConnectorsPage />)} />
        <Route path="/publishing" element={protect(<PublishingPage />)} />
        <Route path="/knowledge" element={protect(<KnowledgePage />)} />
        <Route path="/settings" element={protect(<SettingsPage />)} />
        <Route path="/billing" element={protect(<BillingPage />)} />
        <Route path="/checkout" element={protect(<CheckoutPage />)} />
        <Route path="/admin" element={protect(<AdminDashboard />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}