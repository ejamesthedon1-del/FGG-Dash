import { useState } from "react";
import { useNavigate } from "react-router";
import { SystemsStorage, TrainingSystem, Resource } from "../lib/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { 
  Video, 
  Image as ImageIcon, 
  Link as LinkIcon,
  FileText,
  X,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { FileTooLargeError, readFileAsPersistedDataUrl } from "../lib/file-data-url";

export function CreateSystem() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  
  // New resource form
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resourceType, setResourceType] = useState<'video' | 'image' | 'link' | 'document'>('video');
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");

  const handleAddResource = () => {
    if (!resourceTitle.trim() || !resourceUrl.trim()) {
      toast.error("Please fill in all resource fields");
      return;
    }

    const newResource: Resource = {
      id: Date.now().toString(),
      type: resourceType,
      title: resourceTitle,
      url: resourceUrl,
      createdAt: new Date().toISOString(),
    };

    setResources([...resources, newResource]);
    setResourceTitle("");
    setResourceUrl("");
    setShowResourceForm(false);
    toast.success("Resource added");
  };

  const handleRemoveResource = (id: string) => {
    setResources(resources.filter(r => r.id !== id));
    toast.success("Resource removed");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'video' | 'image' | 'document') => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    void (async () => {
      try {
        const dataUrl = await readFileAsPersistedDataUrl(file);
        const newResource: Resource = {
          id: Date.now().toString(),
          type: type,
          title: file.name,
          url: dataUrl,
          createdAt: new Date().toISOString(),
        };
        setResources((prev) => [...prev, newResource]);
        const label =
          type === 'video' ? 'Video' : type === 'image' ? 'Image' : 'Document';
        toast.success(`${label} embedded — it will persist after you save and return to this site.`);
      } catch (err) {
        if (err instanceof FileTooLargeError) {
          toast.error("That file is too large to store in the browser (max ~4 MB). Use a smaller file or add a link instead.");
          return;
        }
        toast.error("Could not read the file.");
      }
    })();
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a description");
      return;
    }
    if (!category.trim()) {
      toast.error("Please enter a category");
      return;
    }

    const newSystem: TrainingSystem = {
      id: Date.now().toString(),
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      resources,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!SystemsStorage.saveSystem(newSystem)) {
      toast.error("Could not save — browser storage may be full. Remove large uploads from other systems or use links instead.");
      return;
    }
    toast.success("Training system saved. You can add more documents and resources below.");
    navigate(`/system/${newSystem.id}`);
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-5 h-5 text-purple-600" />;
      case 'image': return <ImageIcon className="w-5 h-5 text-blue-600" />;
      case 'link': return <LinkIcon className="w-5 h-5 text-green-600" />;
      case 'document': return <FileText className="w-5 h-5 text-amber-600" />;
      default: return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Create New System</h2>
        <p className="text-gray-600 mt-1">
          Set up a new training system with resources for your team
        </p>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Enter the details about your training system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">System Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Customer Service Protocol"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe what this system covers and when employees should reference it..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Input
              id="category"
              placeholder="e.g., Customer Service, Operations, Sales"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Training Resources</CardTitle>
          <CardDescription>
            Add screen recordings, images, and reference links
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <input
                type="file"
                id="video-upload"
                accept="video/*"
                onChange={(e) => handleFileUpload(e, 'video')}
                className="hidden"
              />
              <label htmlFor="video-upload">
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 cursor-pointer transition-colors">
                  <Video className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium text-gray-700">Upload Video</span>
                </div>
              </label>
            </div>

            <div>
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'image')}
                className="hidden"
              />
              <label htmlFor="image-upload">
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors">
                  <ImageIcon className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">Upload Image</span>
                </div>
              </label>
            </div>

            <div>
              <input
                type="file"
                id="document-upload"
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => handleFileUpload(e, 'document')}
                className="hidden"
              />
              <label htmlFor="document-upload">
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-amber-500 hover:bg-amber-50 cursor-pointer transition-colors">
                  <FileText className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-gray-700">Upload Document</span>
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                setResourceType('link');
                setShowResourceForm(true);
              }}
              className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <LinkIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Add Link</span>
            </button>
          </div>

          {/* Add Resource Form */}
          {showResourceForm && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label>Add Reference Link</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResourceForm(false)}
                >
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
              <Button onClick={handleAddResource} className="w-full">
                Add Link
              </Button>
            </div>
          )}

          {/* Resources List */}
          {resources.length > 0 && (
            <div className="space-y-2">
              <Label>Added Resources ({resources.length})</Label>
              <div className="space-y-2">
                {resources.map(resource => (
                  <div
                    key={resource.id}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
                  >
                    {getResourceIcon(resource.type)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {resource.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{resource.url}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {resource.type}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveResource(resource.id)}
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSave} className="flex-1">
          Create Training System
        </Button>
        <Button variant="outline" onClick={() => navigate("/")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
