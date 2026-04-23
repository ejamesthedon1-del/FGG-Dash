import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { SOPsStorage, type SOP } from "../lib/storage";
import { SOPForm } from "./SOPForm";
import { Button } from "./ui/button";
import { ArrowLeft } from "lucide-react";

export function EditSOP() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sop, setSop] = useState<SOP | undefined>(() => (id ? SOPsStorage.getSOPById(id) : undefined));

  useEffect(() => {
    if (!id) return;
    const load = () => setSop(SOPsStorage.getSOPById(id));
    load();
    window.addEventListener("fgg-storage-sync", load);
    return () => window.removeEventListener("fgg-storage-sync", load);
  }, [id]);

  useEffect(() => {
    if (id && !sop) {
      navigate("/sops", { replace: true });
    }
  }, [id, sop, navigate]);

  if (!id || !sop) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" onClick={() => navigate("/sops")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to SOPs
        </Button>
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  return <SOPForm mode="edit" initialSOP={sop} key={sop.updatedAt} />;
}
