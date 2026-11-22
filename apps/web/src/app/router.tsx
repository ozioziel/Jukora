/* eslint-disable react-refresh/only-export-components -- el router declara rutas perezosas, no es un módulo de HMR */
import { lazy, type ReactNode, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { RequireAuth } from './RequireAuth';

const Home = lazy(() => import('@/pages/Home'));
const Space = lazy(() => import('@/pages/Space'));
const House = lazy(() => import('@/pages/House'));
const SearchScenePage = lazy(() => import('@/pages/SearchScenePage'));
const CategoryResults = lazy(() => import('@/pages/CategoryResults'));
const Explore = lazy(() => import('@/pages/Explore'));
const ListingDetail = lazy(() => import('@/pages/ListingDetail'));
const SupplierProfile = lazy(() => import('@/pages/SupplierProfile'));
const Quotes = lazy(() => import('@/pages/Quotes'));
const OrderPage = lazy(() => import('@/pages/OrderPage'));
const DisputePage = lazy(() => import('@/pages/DisputePage'));
const Account = lazy(() => import('@/pages/Account'));
const SupplierHome = lazy(() => import('@/pages/supplier/SupplierHome'));
const FindBusinesses = lazy(() => import('@/pages/supplier/FindBusinesses'));
const PublishItem = lazy(() => import('@/pages/supplier/PublishItem'));
const Arbiter = lazy(() => import('@/pages/Arbiter'));
const Sell = lazy(() => import('@/pages/Sell'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const s = (el: ReactNode) => <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>{el}</Suspense>;
const p = (el: ReactNode) => s(<RequireAuth>{el}</RequireAuth>);

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: s(<Home />) },
      { path: '/espacio', element: s(<Space />) },
      { path: '/espacio/:projectId', element: p(<House />) },
      { path: '/busqueda/:runId', element: p(<SearchScenePage />) },
      { path: '/busqueda/:runId/:slug', element: p(<CategoryResults />) },
      { path: '/explorar', element: s(<Explore />) },
      { path: '/explorar/articulos/:id', element: s(<ListingDetail />) },
      { path: '/proveedores/:id', element: s(<SupplierProfile />) },
      { path: '/cotizaciones', element: p(<Quotes />) },
      { path: '/pedidos/:id', element: p(<OrderPage />) },
      { path: '/disputas/:id', element: p(<DisputePage />) },
      { path: '/cuenta', element: p(<Account />) },
      { path: '/proveedor', element: p(<SupplierHome />) },
      { path: '/proveedor/negocios', element: p(<FindBusinesses />) },
      { path: '/proveedor/publicar', element: p(<PublishItem />) },
      { path: '/arbitro', element: p(<Arbiter />) },
      { path: '/vender', element: p(<Sell />) },
      { path: '/c/:token', element: s(<Checkout />) },
      { path: '*', element: s(<NotFound />) },
    ],
  },
]);
