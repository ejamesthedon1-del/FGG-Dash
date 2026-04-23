import { Card } from "./ui/card";
import { Target } from "lucide-react";

export function MissionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Our Mission</h2>
        <p className="mt-1 text-gray-600">What we stand for and where we’re headed.</p>
      </div>

      <Card className="p-12">
        <div className="text-center">
          <Target className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">Not updated yet</h3>
          <p className="text-gray-600">This section has not been updated yet.</p>
        </div>
      </Card>
    </div>
  );
}
