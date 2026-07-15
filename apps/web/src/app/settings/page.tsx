"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/loading-skeleton";
import { api, apiPost, apiPatch } from "@/lib/api";
import { toast } from "sonner";
import { Package, Plus, Trash2, User, Mail, Save, Loader2, Settings2, Server, StopCircle, Clock, Globe } from "lucide-react";
import Link from "next/link";

interface Service {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  active: boolean;
}

interface SenderConfig {
  senderName: string;
  senderEmail: string;
  signature: string;
}

export default function SettingsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [addingService, setAddingService] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sender, setSender] = useState<SenderConfig>({ senderName: "", senderEmail: "", signature: "" });
  const [savingSender, setSavingSender] = useState(false);

  const loadServices = useCallback(async () => {
    try { const data = await api<Service[]>("/settings/services"); setServices(data); }
    catch { setServices([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadServices();
    try { const saved = localStorage.getItem("sender_config"); if (saved) setSender(JSON.parse(saved)); } catch { /* ignore */ }
  }, [loadServices]);

  const handleAdd = async () => {
    if (!newName || !newDesc) return;
    setAddingService(true);
    try {
      await apiPost("/settings/services", { name: newName, description: newDesc });
      toast.success("Service added"); setNewName(""); setNewDesc(""); loadServices();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to add service"); }
    finally { setAddingService(false); }
  };

  const toggleActive = async (service: Service) => {
    try {
      await apiPatch(`/settings/services/${service.id}`, { active: !service.active });
      toast.success(`${service.name} ${service.active ? "disabled" : "enabled"}`); loadServices();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to update"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/settings/services/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`${deleteTarget.name} deleted`); setDeleteTarget(null); loadServices();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to delete"); }
    finally { setDeleting(false); }
  };

  const handleSaveSender = () => {
    setSavingSender(true);
    try { localStorage.setItem("sender_config", JSON.stringify(sender)); toast.success("Sender configuration saved"); }
    catch { toast.error("Failed to save configuration"); }
    finally { setSavingSender(false); }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div>
        <p className="text-xs text-[#7b809a]">
          <Link href="/dashboard" className="hover:text-[#344767]">Home</Link>
          <span className="mx-1">/</span>
          <span className="text-[#344767]">Settings</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#344767]">Settings</h1>
        <p className="text-sm text-[#7b809a]">Manage services and sender configuration</p>
      </div>

      <div className="material-card p-6">
        <Tabs defaultValue="services">
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="services">
              <Package className="mr-1.5 size-3.5" />
              Service Catalog
            </TabsTrigger>
            <TabsTrigger value="sender">
              <Mail className="mr-1.5 size-3.5" />
              Sender Config
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <Server className="mr-1.5 size-3.5" />
              Running Tasks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services">
            <div className="space-y-6">
              <p className="text-sm text-[#7b809a]">
                These are the services AI will match companies against. Edit to customize what Brownshift offers.
              </p>

              {loading ? (
                <ListSkeleton rows={4} />
              ) : services.length === 0 ? (
                <EmptyState icon={Package} title="No services configured" description="Add your first service below to get started." />
              ) : (
                <div className="space-y-2">
                  {services.map((s) => (
                    <div key={s.id} className="group flex items-center justify-between rounded-lg border border-[#e9ecef] p-4 transition-colors hover:bg-[#f8f9fa]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#344767]">{s.name}</span>
                          {!s.active && (
                            <Badge variant="secondary" className="text-[10px] bg-[#f0f2f5] text-[#7b809a]">Inactive</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[#7b809a]">{s.description}</p>
                        {s.keywords && s.keywords.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.keywords.map((k) => (
                              <Badge key={k} variant="outline" className="px-1.5 py-0 text-[10px] font-normal border-[#e9ecef] text-[#7b809a]">
                                {k}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant={s.active ? "outline" : "secondary"}
                          size="sm"
                          onClick={() => toggleActive(s)}
                          className="text-xs border-[#e9ecef]"
                        >
                          {s.active ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(s)}
                          className="text-[#7b809a] hover:text-[#f44335] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Service */}
              <div className="rounded-lg border border-dashed border-[#e9ecef] p-5 space-y-3">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#344767]">
                  <Plus className="size-3.5" /> Add Service
                </h3>
                <Input placeholder="Service name" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-[#f8f9fa] border-[#e9ecef]" />
                <Textarea placeholder="Brief description of the service" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} className="bg-[#f8f9fa] border-[#e9ecef]" />
                <Button
                  onClick={handleAdd}
                  disabled={!newName || !newDesc || addingService}
                  size="sm"
                  className="bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white border-0 shadow-md shadow-[#e91e63]/20"
                >
                  {addingService ? (
                    <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Adding...</>
                  ) : (
                    <><Plus className="mr-1.5 size-3.5" />Add Service</>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sender">
            <div className="max-w-lg space-y-6">
              <p className="text-sm text-[#7b809a]">
                Configure the sender identity used for outgoing emails. This is stored locally in your browser.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">
                    <User className="size-3" /> Sender Name
                  </label>
                  <Input placeholder="e.g. Roger Koranteng" value={sender.senderName} onChange={(e) => setSender({ ...sender, senderName: e.target.value })} className="bg-[#f8f9fa] border-[#e9ecef]" />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">
                    <Mail className="size-3" /> Sender Email
                  </label>
                  <Input type="email" placeholder="e.g. roger@brownshift.com" value={sender.senderEmail} onChange={(e) => setSender({ ...sender, senderEmail: e.target.value })} className="bg-[#f8f9fa] border-[#e9ecef]" />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">
                    <Settings2 className="size-3" /> Email Signature
                  </label>
                  <Textarea placeholder="Your email signature" value={sender.signature} onChange={(e) => setSender({ ...sender, signature: e.target.value })} rows={5} className="bg-[#f8f9fa] border-[#e9ecef]" />
                </div>
                <Button onClick={handleSaveSender} disabled={savingSender} className="bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white border-0 shadow-md shadow-[#e91e63]/20">
                  <Save className="mr-1.5 size-3.5" />
                  {savingSender ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Running Tasks Tab */}
          <TabsContent value="tasks">
            <RunningTasksPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[#344767]">Delete Service</DialogTitle>
            <DialogDescription className="text-[#7b809a]">
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting} className="border-[#e9ecef]">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-gradient-to-r from-[#f44335] to-[#d32f2f] text-white border-0"
            >
              {deleting ? (
                <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="mr-1.5 size-3.5" />Delete</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ─── Running Tasks Panel ────────────────────────────

interface DemoTask {
  task_arn: string;
  status: string;
  ip: string | null;
  task_def: string;
  started_at: string | null;
  cpu: string;
  memory: string;
}

function RunningTasksPanel() {
  const [tasks, setTasks] = useState<DemoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState<string | null>(null);
  const [stoppingAll, setStoppingAll] = useState(false);

  const loadTasks = useCallback(() => {
    setLoading(true);
    api<{ tasks: DemoTask[]; count: number }>("/tasks")
      .then((d) => setTasks(d.tasks))
      .catch(() => toast.error("Failed to load tasks"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleStopTask = async (taskArn: string) => {
    setStopping(taskArn);
    try {
      const shortArn = taskArn.split("/").pop() || taskArn;
      await apiPost(`/tasks/${shortArn}/stop`, {});
      toast.success("Task stopped");
      setTimeout(loadTasks, 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stop task");
    } finally {
      setStopping(null);
    }
  };

  const handleStopAll = async () => {
    setStoppingAll(true);
    try {
      const res = await apiPost<{ stopped: number }>("/tasks/stop-all", {});
      toast.success(`${res.stopped} task(s) stopped`);
      setTimeout(loadTasks, 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stop tasks");
    } finally {
      setStoppingAll(false);
    }
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[#7b809a]">
            Demo Fargate tasks running in your AWS account. Each task costs ~$0.03/hour.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadTasks} className="text-xs border-[#e9ecef]">
            Refresh
          </Button>
          {tasks.length > 0 && (
            <Button
              size="sm"
              onClick={handleStopAll}
              disabled={stoppingAll}
              className="text-xs bg-gradient-to-r from-[#f44335] to-[#d32f2f] text-white border-0"
            >
              {stoppingAll ? <Loader2 className="mr-1 size-3 animate-spin" /> : <StopCircle className="mr-1 size-3" />}
              Stop All ({tasks.length})
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No running tasks"
          description="Demo tasks are launched when you build or deploy a demo. They stop automatically after deploy."
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.task_arn} className="group flex items-center justify-between rounded-lg border border-[#e9ecef] p-4 hover:bg-[#f8f9fa] transition-colors">
              <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#1a73e8] to-[#1565c0] text-white">
                  <Server className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#344767]">{t.task_def}</span>
                    <Badge className={`text-[10px] ${t.status === "RUNNING" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                      {t.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#7b809a]">
                    {t.ip && (
                      <span className="flex items-center gap-1">
                        <Globe className="size-3" /> {t.ip}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {timeAgo(t.started_at)}
                    </span>
                    <span>{t.cpu} CPU / {t.memory} MB</span>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStopTask(t.task_arn)}
                disabled={stopping === t.task_arn}
                className="text-xs text-[#f44335] border-[#f44335]/30 hover:bg-[#f44335]/10"
              >
                {stopping === t.task_arn ? <Loader2 className="size-3 animate-spin" /> : <StopCircle className="size-3 mr-1" />}
                Stop
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
