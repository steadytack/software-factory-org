import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from "react-router-dom";

import { LoginPage } from "../pages/LoginPage";
import { RequireAuth } from "../components/RequireAuth";
import { RouteErrorPage } from "../components/RouteErrorPage";
import { AppLayout } from "../layout/AppLayout";

// Every page but Login is its own chunk, fetched when first visited, so the
// first load carries only the shell and the page being opened. The map page
// matters most: maplibre-gl, terra-draw, pmtiles and jspdf are ~1 MB.
const DashboardPage = lazy(() =>
  import("../pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const SitesPage = lazy(() => import("../pages/SitesPage").then((m) => ({ default: m.SitesPage })));
const SiteDetailPage = lazy(() =>
  import("../pages/SiteDetailPage").then((m) => ({ default: m.SiteDetailPage })),
);
const SurveysPage = lazy(() =>
  import("../pages/SurveysPage").then((m) => ({ default: m.SurveysPage })),
);
const SurveyDetailPage = lazy(() =>
  import("../pages/SurveyDetailPage").then((m) => ({ default: m.SurveyDetailPage })),
);
const MapPage = lazy(() => import("../pages/MapPage").then((m) => ({ default: m.MapPage })));
const AdminPage = lazy(() => import("../pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const ProfilePage = lazy(() =>
  import("../pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground/60" />
    </div>
  );
}

/** A lazily-loaded page with the shared spinner while its chunk arrives. */
function page(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

/** A data router: required for `useBlocker` (unsaved-changes guard) and for
 *  the `errorElement`s below, which a plain <BrowserRouter> silently ignores. */
export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} errorElement={<RouteErrorPage />} />
      <Route element={<RequireAuth />} errorElement={<RouteErrorPage />}>
        <Route element={<AppLayout />} errorElement={<RouteErrorPage />}>
          <Route path="/" element={page(<DashboardPage />)} errorElement={<RouteErrorPage />} />
          <Route path="/sites" element={page(<SitesPage />)} errorElement={<RouteErrorPage />} />
          <Route
            path="/sites/:siteId"
            element={page(<SiteDetailPage />)}
            errorElement={<RouteErrorPage />}
          />
          <Route
            path="/surveys"
            element={page(<SurveysPage />)}
            errorElement={<RouteErrorPage />}
          />
          <Route
            path="/surveys/:surveyId"
            element={page(<SurveyDetailPage />)}
            errorElement={<RouteErrorPage />}
          />
          <Route path="/map" element={page(<MapPage />)} errorElement={<RouteErrorPage />} />
          <Route path="/admin" element={page(<AdminPage />)} errorElement={<RouteErrorPage />} />
          <Route
            path="/profile"
            element={page(<ProfilePage />)}
            errorElement={<RouteErrorPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
);
