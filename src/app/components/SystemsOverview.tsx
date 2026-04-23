import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  type OperatorDashboardContent,
  OperatorDashboardStorage,
  SOPsStorage,
  SystemsStorage,
  TrainingSystem,
} from "../lib/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { 
  Video, 
  Image as ImageIcon, 
  Link as LinkIcon,
  FileText,
  FolderOpen,
  Calendar,
  AlertTriangle,
  ClipboardList,
  Megaphone,
  CheckCircle2
} from "lucide-react";
import { format } from "date-fns";

export function SystemsOverview() {
  const [systems, setSystems] = useState<TrainingSystem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [topSops, setTopSops] = useState<
    Array<{ id: string; title: string; status: "Draft" | "Active" | "Needs Update"; updatedAt: string }>
  >([]);
  const [homeContent, setHomeContent] = useState<OperatorDashboardContent>(
    OperatorDashboardStorage.getContent(),
  );

  const loadSystems = useCallback(() => {
    const allSystems = SystemsStorage.getSystems();
    setSystems(allSystems);
    setCategories(SystemsStorage.getCategories());
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
    loadSystems();
  }, [loadSystems]);

  useEffect(() => {
    window.addEventListener("fgg-storage-sync", loadSystems);
    return () => window.removeEventListener("fgg-storage-sync", loadSystems);
  }, [loadSystems]);

  const filteredSystems = systems.filter(
    (system) => categoryFilter === "all" || system.category === categoryFilter,
  );

  const getResourceCounts = (system: TrainingSystem) => {
    const videos = system.resources.filter(r => r.type === 'video').length;
    const images = system.resources.filter(r => r.type === 'image').length;
    const links = system.resources.filter(r => r.type === 'link').length;
    const documents = system.resources.filter(r => r.type === 'document').length;
    return { videos, images, links, documents };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Training Systems</h2>
        <p className="text-gray-600 mt-1">
          Manage and organize all your training materials in one place
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              Today's priorities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {homeContent.priorities.map((item) => (
              <p key={item} className="text-gray-700">{item}</p>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-600" />
              Quick SOP links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {homeContent.quickLinks.length > 0 ? (
              homeContent.quickLinks.map((item) => (
                <Link key={`${item.label}-${item.to}`} to={item.to} className="block rounded-md border px-3 py-2 hover:bg-gray-50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{item.label}</p>
                  </div>
                </Link>
              ))
            ) : topSops.length === 0 ? (
              <p className="text-sm text-gray-500">No SOPs yet. Create one to populate quick links.</p>
            ) : (
              topSops.map((sop) => (
                <Link key={sop.id} to="/sops" className="block rounded-md border px-3 py-2 hover:bg-gray-50">
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
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-600" />
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
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Open issues needing attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {homeContent.openIssues.map((item) => (
              <p key={item}>{item}</p>
            ))}
            <p>Outstanding SOP reviews: {topSops.filter((sop) => sop.status !== "Active").length}</p>
            <Link to="/sops" className="text-blue-600 hover:underline">Review SOP library</Link>
          </CardContent>
        </Card>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:justify-end">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Stats */}
      {systems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Systems</p>
                  <p className="text-2xl font-semibold text-gray-900">{systems.length}</p>
                </div>
                <FolderOpen className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Resources</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {systems.reduce((sum, s) => sum + s.resources.length, 0)}
                  </p>
                </div>
                <Video className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Categories</p>
                  <p className="text-2xl font-semibold text-gray-900">{categories.length}</p>
                </div>
                <Calendar className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Systems Grid */}
      {filteredSystems.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredSystems.map((system) => {
            const counts = getResourceCounts(system);
            return (
              <Link key={system.id} to={`/system/${system.id}`}>
                <Card className="h-full cursor-pointer transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-2 flex items-start justify-between">
                      <Badge variant="secondary">{system.category}</Badge>
                      <span className="text-xs text-gray-500">
                        {format(new Date(system.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    <CardTitle className="line-clamp-2">{system.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{system.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {counts.videos > 0 && (
                        <div className="flex items-center gap-1">
                          <Video className="h-4 w-4" />
                          <span>{counts.videos}</span>
                        </div>
                      )}
                      {counts.images > 0 && (
                        <div className="flex items-center gap-1">
                          <ImageIcon className="h-4 w-4" />
                          <span>{counts.images}</span>
                        </div>
                      )}
                      {counts.documents > 0 && (
                        <div className="flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          <span>{counts.documents}</span>
                        </div>
                      )}
                      {counts.links > 0 && (
                        <div className="flex items-center gap-1">
                          <LinkIcon className="h-4 w-4" />
                          <span>{counts.links}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
