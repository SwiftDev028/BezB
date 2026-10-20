import { Outlet } from 'react-router-dom'
import { ScrollToTop } from '../common/ScrollToTop'
import { AnnouncementBar } from './AnnouncementBar'
import { Footer } from './Footer'
import { Header } from './Header'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
      >
        Перейти к содержимому
      </a>
      <ScrollToTop />
      <AnnouncementBar />
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
