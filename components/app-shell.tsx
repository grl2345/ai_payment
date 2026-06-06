'use client'

import { usePathname } from 'next/navigation'
import { MobileNav, Sidebar } from '@/components/sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background pb-16 md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  )
}
