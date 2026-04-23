import { createBrowserRouter } from "react-router";
import { DashboardLayout } from "./components/DashboardLayout";
import { SystemsOverview } from "./components/SystemsOverview";
import { SystemDetail } from "./components/SystemDetail";
import { CreateSystem } from "./components/CreateSystem";
import { SOPsPage } from "./components/SOPsPage";
import { CreateSOP } from "./components/CreateSOP";
import { EditSOP } from "./components/EditSOP";
import { MissionPage } from "./components/MissionPage";
import { AdminPage } from "./components/AdminPage";
import { BrandHubPage } from "./components/BrandHubPage";
import { BrandHubDetail } from "./components/BrandHubDetail";
import { TrainingCenterPage } from "./components/TrainingCenterPage";
import { TrainingModuleDetail } from "./components/TrainingModuleDetail";

export const router = createBrowserRouter([
  { path: "/admin", Component: AdminPage },
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      { index: true, Component: SystemsOverview },
      { path: "sops/create", Component: CreateSOP },
      { path: "sops/edit/:id", Component: EditSOP },
      { path: "sops", Component: SOPsPage },
      { path: "brand-hub", Component: BrandHubPage },
      { path: "brand-hub/:slug", Component: BrandHubDetail },
      { path: "training-center", Component: TrainingCenterPage },
      { path: "training-center/:moduleId", Component: TrainingModuleDetail },
      { path: "our-mission", Component: MissionPage },
      { path: "system/:id", Component: SystemDetail },
      { path: "create", Component: CreateSystem },
    ],
  },
]);
