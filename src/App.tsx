import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import HomePage from './pages/HomePage'
import { OrdersProvider } from './context/OrdersContext'

// Главная грузится сразу, остальные страницы — по требованию (меньше стартовый бандл)
const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const CategoryPage = lazy(() => import('./pages/CategoryPage'))
const ProductPage = lazy(() => import('./pages/ProductPage'))
const GamePage = lazy(() => import('./pages/GamePage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'))
const CartPage = lazy(() => import('./pages/CartPage'))
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const FaqPage = lazy(() => import('./pages/FaqPage'))
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'))
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const ContactsPage = lazy(() => import('./pages/ContactsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage'))
const AdminOrderDetailPage = lazy(() => import('./pages/admin/AdminOrderDetailPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const MyOrdersPage = lazy(() => import('./pages/MyOrdersPage'))
const AdminCatalogPage = lazy(() => import('./pages/admin/AdminCatalogPage'))
const AdminSuppliersPage = lazy(() => import('./pages/admin/AdminSuppliersPage'))
const AdminInventoryPage = lazy(() => import('./pages/admin/AdminInventoryPage'))
const SupportThreadsPage = lazy(() => import('./pages/SupportThreadsPage'))
const SupportChatPage = lazy(() => import('./pages/SupportChatPage'))
const SupportOrderPage = lazy(() => import('./pages/SupportOrderPage'))
const AdminSupportInboxPage = lazy(() => import('./pages/SupportInboxPage'))

function PageFallback() {
  return (
    <div className="container-x py-16 text-center text-silver" role="status">
      Загрузка…
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="category/:id" element={<CategoryPage />} />
          <Route path="product/:slug" element={<ProductPage />} />
          <Route path="game/:slug" element={<GamePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="refunds" element={<RefundPolicyPage />} />
          <Route path="refund-policy" element={<Navigate to="/refunds" replace />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="account/orders" element={<MyOrdersPage />} />
          <Route path="support" element={<SupportThreadsPage />} />
          <Route path="support/order/:orderId" element={<SupportOrderPage />} />
          <Route path="support/:orderId" element={<SupportChatPage />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<OrdersProvider><AdminOrdersPage /></OrdersProvider>} />
            <Route path="orders/:id" element={<OrdersProvider><AdminOrderDetailPage /></OrdersProvider>} />
            <Route path="catalog" element={<AdminCatalogPage />} />
            <Route path="suppliers" element={<AdminSuppliersPage />} />
            <Route path="inventory" element={<AdminInventoryPage />} />
            <Route path="support" element={<AdminSupportInboxPage />} />
          </Route>
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
