import { createBrowserRouter, Navigate } from "react-router";
import { DashboardLayout } from "./components/DashboardLayout";
import { SystemsOverview } from "./components/SystemsOverview";
import { SystemDetail } from "./components/SystemDetail";
import { CreateSystem } from "./components/CreateSystem";
import { SOPsPage } from "./components/SOPsPage";
import { CreateSOP } from "./components/CreateSOP";
import { EditSOP } from "./components/EditSOP";
import { MissionPage } from "./components/MissionPage";
import { AdminPage } from "./components/AdminPage";
import { SettingsPage } from "./components/SettingsPage";
import { MyTasksPage } from "./components/MyTasksPage";
import { BrandHubPage } from "./components/BrandHubPage";
import { BrandHubDetail } from "./components/BrandHubDetail";
import { CreativeAssetsPage } from "./components/CreativeAssetsPage";
import { TrainingCenterPage } from "./components/TrainingCenterPage";
import { TrainingModuleDetail } from "./components/TrainingModuleDetail";
import { OrderFlowPage } from "./components/OrderFlowPage";
import { CeoOnly } from "./components/CeoOnly";
import { NotFoundPage, RouteErrorPage } from "./components/RouteErrorPage";

function ceoPage(Component: React.ComponentType) {
  return function CeoGuardedPage() {
    return (
      <CeoOnly>
        <Component />
      </CeoOnly>
    );
  };
}

export const router = createBrowserRouter([
  { path: "/admin", Component: AdminPage, errorElement: <RouteErrorPage /> },
  {
    path: "/",
    Component: DashboardLayout,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, Component: SystemsOverview },
      { path: "order-flow", Component: OrderFlowPage },
      { path: "my-tasks", Component: MyTasksPage },
      { path: "sops/create", Component: ceoPage(CreateSOP) },
      { path: "sops/edit/:id", Component: ceoPage(EditSOP) },
      { path: "sops", Component: SOPsPage },
      { path: "brand-hub", Component: ceoPage(BrandHubPage) },
      { path: "brand-hub/:slug", Component: ceoPage(BrandHubDetail) },
      { path: "creative-assets", Component: ceoPage(CreativeAssetsPage) },
      { path: "training-center", Component: ceoPage(TrainingCenterPage) },
      { path: "training-center/:moduleId", Component: ceoPage(TrainingModuleDetail) },
      { path: "our-mission", Component: ceoPage(MissionPage) },
      { path: "settings", Component: SettingsPage },
      { path: "system/:id", Component: SystemDetail },
      { path: "create", Component: CreateSystem },
      { path: "admin", element: <Navigate to="/settings" replace /> },
      { path: "*", Component: NotFoundPage },
    ],
  },
  { path: "*", Component: NotFoundPage },
]);
