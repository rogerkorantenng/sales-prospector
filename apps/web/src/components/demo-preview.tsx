"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink, Rocket, Copy, Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";

interface DemoPreviewProps {
  projectId: string;
  previewUrl: string | null;
  liveUrl: string | null;
  status: string;
  onDeploy: () => void;
  onEdit?: () => void;
  deploying: boolean;
}

export function DemoPreview({ projectId, previewUrl, liveUrl, status, onDeploy, onEdit, deploying }: DemoPreviewProps) {
  const showPreview = previewUrl && (status === "preview" || status === "deployed");
  // Proxy URL avoids mixed content (HTTPS dashboard → HTTP task)
  const proxyUrl = `/api/demos/${projectId}/preview/`;

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  return (
    <div className="flex h-full flex-col bg-[#f8f9fa]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[#e9ecef] bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Monitor className="size-4 text-[#7b809a]" />
          <span className="text-xs font-medium text-[#344767]">Preview</span>
          {status === "building" && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              <Loader2 className="size-3 mr-1 animate-spin" /> Building...
            </Badge>
          )}
          {status === "generating" && (
            <Badge className="bg-purple-100 text-purple-700 text-[10px]">
              <Loader2 className="size-3 mr-1 animate-spin" /> Generating...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showPreview && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => {
                  const iframe = document.getElementById("demo-preview-iframe") as HTMLIFrameElement;
                  if (iframe) iframe.src = iframe.src;
                }}
              >
                <RefreshCw className="size-3 mr-1" /> Refresh
              </Button>
              <a href={previewUrl!} target="_blank">
                <Button variant="outline" size="sm" className="h-7 text-[11px]">
                  <ExternalLink className="size-3 mr-1" /> New Tab
                </Button>
              </a>
            </>
          )}
          {(status === "preview" || status === "deployed") && (
            <Button
              size="sm"
              className="h-7 text-[11px] bg-gradient-to-br from-[#4caf50] to-[#388e3c] text-white"
              onClick={onDeploy}
              disabled={deploying}
            >
              {deploying ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Rocket className="size-3 mr-1" />}
              {status === "deployed" ? "Re-deploy" : "Deploy"}
            </Button>
          )}
          {status === "deployed" && onEdit && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={onEdit}
            >
              <RefreshCw className="size-3 mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* Live URL banner */}
      {liveUrl && (
        <div className="flex items-center justify-between bg-emerald-50 border-b border-emerald-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-medium text-emerald-700">Deployed:</span>
            <a href={liveUrl} target="_blank" className="text-xs text-emerald-600 hover:underline">{liveUrl}</a>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-emerald-600" onClick={() => copyUrl(liveUrl)}>
            <Copy className="size-3 mr-1" /> Copy
          </Button>
        </div>
      )}

      {/* Preview */}
      <div className="flex-1 overflow-hidden">
        {showPreview ? (
          <iframe
            id="demo-preview-iframe"
            src={proxyUrl}
            className="h-full w-full border-0"
            title="Demo Preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              {status === "generating" ? (
                <>
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e91e63]/10 to-[#c2185b]/10">
                    <Loader2 className="size-8 text-[#e91e63] animate-spin" />
                  </div>
                  <h3 className="text-sm font-bold text-[#344767]">Generating your demo...</h3>
                  <p className="text-xs text-[#7b809a] mt-1">AI is building a full Next.js application</p>
                </>
              ) : status === "building" ? (
                <>
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1a73e8]/10 to-[#1565c0]/10">
                    <Loader2 className="size-8 text-[#1a73e8] animate-spin" />
                  </div>
                  <h3 className="text-sm font-bold text-[#344767]">Building application...</h3>
                  <p className="text-xs text-[#7b809a] mt-1">Compiling Next.js project. This takes 2-5 minutes.</p>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#f0f2f5]">
                    <Monitor className="size-8 text-[#7b809a]" />
                  </div>
                  <h3 className="text-sm font-bold text-[#344767]">Preview will appear here</h3>
                  <p className="text-xs text-[#7b809a] mt-1">Answer the questions in the chat to start building</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
