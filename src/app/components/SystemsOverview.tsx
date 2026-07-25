import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  type OperatorDashboardContent,
  OperatorDashboardStorage,
  SOPsStorage,
} from "../lib/storage";
import { useAuth } from "../lib/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  AlertTriangle,
  ClipboardList,
  Megaphone,
  CheckCircle2,
} from "lucide-react";
import { CombinedLiveStoresPanel } from "./CombinedLiveStoresPanel";

export function SystemsOverview() {
  const { loading: authLoading, isCeo } = useAuth();
  const [topSops, setTopSops] = useState<
    Array<{ id: string; title: string; status: "Draft" | "Active" | "Needs Update"; updatedAt: string }>
  >([]);
  const [homeContent, setHomeContent] = useState<OperatorDashboardContent>(
    OperatorDashboardStorage.getContent(),
  );

  const loadHome = useCallback(() => {
    setHomeContent(OperatorDashboardStorage.getContent());
    const recentSops = SOPsStorage.getSOPs()
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, 5)
      .map((sop) => ({
        id: sop.id,
        title: sop.title,
        status: sop.status ?? "Active",
        updatedAt: sop.updatedAt,
      }));
    setTopSops(recentSops);
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  useEffect(() => {
    window.addEventListener("fgg-storage-sync", loadHome);
    return () => window.removeEventListener("fgg-storage-sync", loadHome);
  }, [loadHome]);

  // Temporary: guest sees the same Ops / Productions home. Tighten auth later.
  const showCeoFinance = !authLoading && isCeo;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
          Ops / Productions
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-gray-900">Daily ops brief</h2>
        <p className="mt-1 text-gray-600">
          Priorities, tasks due today, and open issues for the floor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              Today&apos;s priorities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {homeContent.priorities.map((item) => (
              <p key={item} className="text-gray-700">
                {item}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-indigo-600" />
              Quick SOP links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {homeContent.quickLinks.length > 0 ? (
              homeContent.quickLinks.map((item) => (
                <Link
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  className="block rounded-md border px-3 py-2 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{item.label}</p>
                  </div>
                </Link>
              ))
            ) : topSops.length === 0 ? (
              <p className="text-sm text-gray-500">No SOPs yet. Create one to populate quick links.</p>
            ) : (
              topSops.map((sop) => (
                <Link
                  key={sop.id}
                  to="/sops"
                  className="block rounded-md border px-3 py-2 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{sop.title}</p>
                    <span className="text-xs text-gray-500">{sop.status}</span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-amber-600" />
              Updates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {homeContent.updates.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tasks due today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {homeContent.tasksDueToday.map((item) => (
              <p key={item}>- {item}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Open issues needing attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {homeContent.openIssues.map((item) => (
              <p key={item}>{item}</p>
            ))}
            <p>
              Outstanding SOP reviews:{" "}
              {topSops.filter((sop) => sop.status !== "Active").length}
            </p>
            <Link to="/sops" className="text-blue-600 hover:underline">
              Review SOP library
            </Link>
          </CardContent>
        </Card>
      </div>

      {showCeoFinance ? (
        <div className="space-y-3 border-t border-gray-200 pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              CEO only
            </p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">Live store performance</h3>
            <p className="mt-1 text-sm text-gray-600">
              Profit, revenue, ads, and production.
            </p>
          </div>
          <CombinedLiveStoresPanel />
        </div>
      ) : null}
    </div>
  );
}
