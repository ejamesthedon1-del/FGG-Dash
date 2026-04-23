import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { SystemsStorage, TrainingSystem, Resource } from "../lib/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { 
  Video, 
  Image as ImageIcon, 
  Link as LinkIcon,
  FileText,
  ArrowLeft,
  Trash2,
  ExternalLink,
  Calendar,
  Clock,
  X
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileTooLargeError, readFileAsPersistedDataUrl } from "../lib/file-data-url";

export function SystemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [system, setSystem] = useState<TrainingSystem | null>(null);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");

  useEffect(() => {
    const load = () => {
      if (!id) return;
      const foundSystem = SystemsStorage.getSystemById(id);
      if (foundSystem) {
        setSystem(foundSystem);
      } else {
        toast.error("System not found");
        navigate("/");
      }
    };
    load();
    window.addEventListener("fgg-storage-sync", load);
    return () => window.removeEventListener("fgg-storage-sync", load);
  }, [id, navigate]);

  const persistSystem = (next: TrainingSystem): boolean => {
    const updated: TrainingSystem = {
      ...next,
      updatedAt: new Date().toISOString(),
    };
    const ok = SystemsStorage.saveSystem(updated);
    if (!ok) {
      toast.error("Could not save — browser storage may be full. Try smaller files or remove old uploads.");
      return false;
    }
    setSystem(updated);
    return true;
  };

  const handleAddLink = () => {
    if (!system) return;
    if (!resourceTitle.trim() || !resourceUrl.trim()) {
      toast.error("Please fill in title and URL");
      return;
    }
    const newResource: Resource = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: "link",
      title: resourceTitle.trim(),
      url: resourceUrl.trim(),
      createdAt: new Date().toISOString(),
    };
    if (
      !persistSystem({
        ...system,
        resources: [...system.resources, newResource],
      })
    ) {
      return;
    }
    setResourceTitle("");
    setResourceUrl("");
    setShowResourceForm(false);
    toast.success("Link added");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "video" | "image" | "document") => {
    if (!system) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    void (async () => {
      try {
        const dataUrl = await readFileAsPersistedDataUrl(file);
        const newResource: Resource = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          type,
          title: file.name,
          url: dataUrl,
          createdAt: new Date().toISOString(),
        };
        if (
          !persistSystem({
            ...system,
            resources: [...system.resources, newResource],
          })
        ) {
          return;
        }
        const label = type === "video" ? "Video" : type === "image" ? "Image" : "Document";
        toast.success(`${label} saved — it will persist after you leave this site.`);
      } catch (err) {
        if (err instanceof FileTooLargeError) {
          toast.error("That file is too large to store in the browser (max ~4 MB). Use a smaller file or add a link instead.");
          return;
        }
        toast.error("Could not read the file.");
      }
    })();
  };

  const handleRemoveResource = (resourceId: string) => {
    if (!system) return;
    const victim = system.resources.find((r) => r.id === resourceId);
    if (victim?.url.startsWith("blob:")) URL.revokeObjectURL(victim.url);
    if (
      !persistSystem({
        ...system,
        resources: system.resources.filter((r) => r.id !== resourceId),
      })
    ) {
      return;
    }
    toast.success("Resource removed");
  };

  const handleDelete = () => {
    if (id) {
      SystemsStorage.deleteSystem(id);
      toast.success("System deleted successfully");
      navigate("/");
    }
  };

  if (!system) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const videos = system.resources.filter(r => r.type === 'video');
  const images = system.resources.filter(r => r.type === 'image');
  const links = system.resources.filter(r => r.type === 'link');
  const documents = system.resources.filter(r => r.type === 'document');

  const ResourceCard = ({ resource }: { resource: Resource }) => {
    const icon =
      resource.type === "video" ? (
        <Video className="w-5 h-5 text-purple-600" />
      ) : resource.type === "image" ? (
        <ImageIcon className="w-5 h-5 text-blue-600" />
      ) : resource.type === "document" ? (
        <FileText className="w-5 h-5 text-amber-600" />
      ) : (
        <LinkIcon className="w-5 h-5 text-green-600" />
      );

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-gray-900 mb-1">{resource.title}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 -mr-2 -mt-1"
                  onClick={() => handleRemoveResource(resource.id)}
                  aria-label="Remove resource"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
              {resource.type === 'video' && (
                <video
                  src={resource.url}
                  controls
                  className="w-full rounded-lg mt-2 bg-gray-100"
                >
                  Your browser does not support the video tag.
                </video>
              )}
              {resource.type === 'image' && (
                <img
                  src={resource.url}
                  alt={resource.title}
                  className="w-full rounded-lg mt-2 object-cover max-h-64"
                />
              )}
              {resource.type === 'link' && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm mt-2 group"
                >
                  <span className="truncate">{resource.url}</span>
                  <ExternalLink className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </a>
              )}
              {resource.type === "document" && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-amber-700 hover:text-amber-800 text-sm font-medium mt-2"
                >
                  <FileText className="w-4 h-4" />
                  Open document
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Added {format(new Date(resource.createdAt), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Systems
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit">
                {system.category}
              </Badge>
              <div>
                <CardTitle className="text-2xl">{system.title}</CardTitle>
                <CardDescription className="text-base mt-2">
                  {system.description}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Created {format(new Date(system.createdAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Updated {format(new Date(system.updatedAt), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Training System</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{system.title}"? This action cannot be undone
                    and all resources will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                    Delete System
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
      </Card>

      {/* Add resources after creation */}
      <Card>
        <CardHeader>
          <CardTitle>Add resources</CardTitle>
          <CardDescription>
            Upload documents, videos, and images, or add a link. Changes save to this system automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <input
                type="file"
                id="detail-video-upload"
                accept="video/*"
                onChange={(e) => handleFileUpload(e, "video")}
                className="hidden"
              />
              <label htmlFor="detail-video-upload">
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 cursor-pointer transition-colors">
                  <Video className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium text-gray-700">Upload Video</span>
                </div>
              </label>
            </div>
            <div>
              <input
                type="file"
                id="detail-image-upload"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, "image")}
                className="hidden"
              />
              <label htmlFor="detail-image-upload">
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors">
                  <ImageIcon className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">Upload Image</span>
                </div>
              </label>
            </div>
            <div>
              <input
                type="file"
                id="detail-document-upload"
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => handleFileUpload(e, "document")}
                className="hidden"
              />
              <label htmlFor="detail-document-upload">
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-amber-500 hover:bg-amber-50 cursor-pointer transition-colors">
                  <FileText className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-gray-700">Upload Document</span>
                </div>
              </label>
            </div>
            <button
              type="button"
              onClick={() => setShowResourceForm((v) => !v)}
              className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <LinkIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Add Link</span>
            </button>
          </div>

          {showResourceForm && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label>Add reference link</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowResourceForm(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Input
                placeholder="Link title"
                value={resourceTitle}
                onChange={(e) => setResourceTitle(e.target.value)}
              />
              <Input
                placeholder="https://example.com"
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
              />
              <Button type="button" onClick={handleAddLink} className="w-full">
                Add link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resources Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Video className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Screen Recordings</p>
                <p className="text-xl font-semibold text-gray-900">{videos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <ImageIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Images</p>
                <p className="text-xl font-semibold text-gray-900">{images.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-lg">
                <FileText className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Documents</p>
                <p className="text-xl font-semibold text-gray-900">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <LinkIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Reference Links</p>
                <p className="text-xl font-semibold text-gray-900">{links.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resources Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all">
            All ({system.resources.length})
          </TabsTrigger>
          <TabsTrigger value="videos">
            Videos ({videos.length})
          </TabsTrigger>
          <TabsTrigger value="images">
            Images ({images.length})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="links">
            Links ({links.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {system.resources.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <p className="text-gray-500">No resources added yet</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {system.resources.map(resource => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="videos" className="space-y-4">
          {videos.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <Video className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No videos added yet</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {videos.map(resource => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          {images.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No images added yet</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {images.map(resource => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {documents.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No documents yet — use Upload Document above</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {documents.map(resource => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="links" className="space-y-4">
          {links.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <LinkIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No links added yet</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {links.map(resource => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
