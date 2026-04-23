import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { getBrands } from "../lib/brand-hub-storage";
import type { BrandProfile, BrandStatus } from "../lib/brand-hub-data";

function statusStyles(status: BrandStatus): string {
  switch (status) {
    case "Active":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "Pilot":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "Paused":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Planning":
      return "border-gray-200 bg-gray-50 text-gray-800";
    default:
      return "border-gray-200 bg-gray-50 text-gray-800";
  }
}

export function BrandHubPage() {
  const { pathname } = useLocation();
  const [brands, setBrands] = useState<BrandProfile[]>(() => getBrands());

  useEffect(() => {
    const refresh = () => setBrands(getBrands());
    refresh();
    window.addEventListener("fgg-storage-sync", refresh);
    return () => window.removeEventListener("fgg-storage-sync", refresh);
  }, [pathname]);

  const sorted = useMemo(
    () => [...brands].sort((a, b) => a.name.localeCompare(b.name)),
    [brands],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Brand Hub</h2>
          <p className="mt-1 max-w-2xl text-gray-600">
            Future Garment Group brands in one place — how each line is different, how to handle it on the floor, and
            where to go next.
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white/80 px-6 py-14 text-center shadow-sm">
          <Sparkles className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-900">No brands configured yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Brands are defined in the catalog. Contact your admin if this list should not be empty.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((brand) => (
            <Card
              key={brand.id}
              className="overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{brand.name}</CardTitle>
                      <Badge variant="outline" className={`shrink-0 font-medium ${statusStyles(brand.status)}`}>
                        {brand.status}
                      </Badge>
                    </div>
                    <CardDescription className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600">
                      {brand.shortDescription}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {brand.primaryNotes?.trim() ? (
                  <div className="rounded-lg bg-gray-50/90 px-3 py-2.5 text-sm text-gray-700">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Primary notes</span>
                    <p className="mt-1 leading-snug">{brand.primaryNotes}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {(brand.quickLinks ?? []).slice(0, 2).map((link) =>
                    link.href.startsWith("http") ? (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        {link.label} ↗
                      </a>
                    ) : (
                      <Link
                        key={link.label + link.href}
                        to={link.href}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        {link.label}
                      </Link>
                    ),
                  )}
                </div>
                <Button variant="secondary" className="w-full gap-2" asChild>
                  <Link to={`/brand-hub/${brand.id}`}>
                    Open brand profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
