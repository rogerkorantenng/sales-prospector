"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, apiPost } from "@/lib/api";
import { toast } from "sonner";
import { DemoChat } from "@/components/demo-chat";
import { DemoPreview } from "@/components/demo-preview";
import Link from "next/link";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface Message {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface DemoProject {
  id: string;
  name: string;
  demo_type: string;
  status: string;
  preview_url: string | null;
  live_url: string | null;
}

export function DemoBuilder({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<DemoProject | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const data = await api<DemoProject>(`/demos/${projectId}`);
      setProject(data);
    } catch {
      toast.error("Failed to load demo");
    }
  }, [projectId]);

  const loadMessages = useCallback(async () => {
    try {
      const data = await api<Message[]>(`/demos/${projectId}/messages`);
      setMessages(data);
    } catch {
      // silent
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
    loadMessages();
  }, [loadProject, loadMessages]);

  // Poll build status when building
  useEffect(() => {
    if (project?.status === "building" || project?.status === "generating") {
      pollRef.current = setInterval(async () => {
        try {
          const status = await api<{ status: string; preview_url: string | null }>(`/demos/${projectId}/build-status`);
          if (status.status !== project.status) {
            setProject((p) => p ? { ...p, status: status.status, preview_url: status.preview_url || p.preview_url } : p);
            loadMessages();
            if (status.status === "preview" || status.status === "failed") {
              if (pollRef.current) clearInterval(pollRef.current);
            }
          }
        } catch {
          // silent
        }
      }, 5000);

      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [project?.status, projectId, loadMessages]);

  const handleSendMessage = async (content: string) => {
    setSending(true);
    // Optimistically add user message
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await apiPost<Message>(`/demos/${projectId}/message`, { content });
      // Reload all messages to get the AI response
      await loadMessages();
      await loadProject();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const result = await apiPost<{ live_url: string }>(`/demos/${projectId}/deploy`, {});
      toast.success("Demo deployed!");
      setProject((p) => p ? { ...p, live_url: result.live_url, status: "deployed" } : p);
      loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleEdit = async () => {
    try {
      await apiPost(`/demos/${projectId}/edit`, {});
      toast.success("Re-launching dev server...");
      loadProject();
      loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to re-launch");
    }
  };

  const handleRetry = async () => {
    try {
      await apiPost(`/demos/${projectId}/retry`, {});
      toast.success("Retrying...");
      loadProject();
      loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  };

  const [chatVisible, setChatVisible] = useState(true);

  if (!project) return null;

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e9ecef] bg-white px-4 py-2.5 rounded-t-xl">
        <div className="flex items-center gap-3">
          <Link href="/demos" className="text-[#7b809a] hover:text-[#344767]">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h2 className="text-sm font-bold text-[#344767]">{project.name}</h2>
            <p className="text-[10px] text-[#7b809a] capitalize">{project.demo_type.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={() => setChatVisible(!chatVisible)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#7b809a] hover:bg-[#f0f2f5] hover:text-[#344767] transition-colors"
        >
          {chatVisible ? (
            <><PanelLeftClose className="size-3.5" /> Hide Chat</>
          ) : (
            <><PanelLeftOpen className="size-3.5" /> Show Chat</>
          )}
        </button>
      </div>

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden rounded-b-xl">
        {/* Chat panel — collapsible */}
        {chatVisible && (
          <div className="w-[40%] border-r border-[#e9ecef] bg-[#f8f9fa]">
            <DemoChat
              messages={messages}
              onSendMessage={handleSendMessage}
              onRetry={handleRetry}
              sending={sending}
              status={project.status}
            />
          </div>
        )}

        {/* Preview — expands to full when chat hidden */}
        <div className="flex-1">
          <DemoPreview
            projectId={projectId}
            previewUrl={project.preview_url}
            liveUrl={project.live_url}
            status={project.status}
            onDeploy={handleDeploy}
            onEdit={handleEdit}
            deploying={deploying}
          />
        </div>
      </div>
    </div>
  );
}
