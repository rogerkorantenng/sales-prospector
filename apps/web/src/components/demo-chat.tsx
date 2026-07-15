"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User, Loader2, FileCode, RotateCcw } from "lucide-react";

interface Message {
  id: string;
  role: string;
  content: string;
  metadata?: {
    type?: string;
    quick_replies?: string[];
    select_type?: string;
    files_count?: number;
    preview_url?: string;
    live_url?: string;
    status?: string;
  };
  created_at: string;
}

interface DemoChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onRetry?: () => void;
  sending: boolean;
  status: string;
}

export function DemoChat({ messages, onSendMessage, onRetry, sending, status }: DemoChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleQuickReply = (reply: string) => {
    if (sending) return;
    onSendMessage(reply);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[#e9ecef] px-4 py-3">
        <h3 className="text-sm font-bold text-[#344767]">Demo Builder Chat</h3>
        <div className="flex items-center gap-2 mt-1">
          <div className={`size-2 rounded-full ${
            status === "generating" || status === "building" ? "bg-amber-400 animate-pulse" :
            status === "preview" || status === "deployed" ? "bg-emerald-400" : "bg-gray-300"
          }`} />
          <span className="text-[10px] text-[#7b809a] capitalize">{status}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
              msg.role === "user"
                ? "bg-gradient-to-br from-[#344767] to-[#1f283e]"
                : "bg-gradient-to-br from-[#e91e63] to-[#c2185b]"
            }`}>
              {msg.role === "user" ? <User className="size-4 text-white" /> : <Bot className="size-4 text-white" />}
            </div>
            <div className={`max-w-[80%] ${msg.role === "user" ? "text-right" : ""}`}>
              <div className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#344767] text-white"
                  : "bg-white border border-[#e9ecef] text-[#344767]"
              }`}>
                {msg.content}
              </div>

              {/* Quick replies */}
              {msg.metadata?.quick_replies && msg.metadata.quick_replies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.metadata.quick_replies.map((reply) => (
                    <Button
                      key={reply}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-[#e91e63]/30 text-[#e91e63] hover:bg-[#e91e63]/10"
                      onClick={() => handleQuickReply(reply)}
                      disabled={sending}
                    >
                      {reply}
                    </Button>
                  ))}
                </div>
              )}

              {/* File list */}
              {msg.metadata?.files_count && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[#7b809a]">
                  <FileCode className="size-3" />
                  {msg.metadata.files_count} files generated
                </div>
              )}

              {/* Live URL */}
              {msg.metadata?.live_url && (
                <a
                  href={msg.metadata.live_url}
                  target="_blank"
                  className="inline-block mt-2 text-xs text-[#e91e63] font-medium hover:underline"
                >
                  {msg.metadata.live_url}
                </a>
              )}

              {/* Retry button on error messages */}
              {msg.metadata?.type === "error" && onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs border-[#e91e63]/30 text-[#e91e63] hover:bg-[#e91e63]/10"
                  onClick={onRetry}
                  disabled={sending}
                >
                  <RotateCcw className="size-3 mr-1.5" /> Retry
                </Button>
              )}

              <p className="text-[9px] text-[#7b809a]/60 mt-1">
                {new Date(msg.created_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e91e63] to-[#c2185b]">
              <Loader2 className="size-4 text-white animate-spin" />
            </div>
            <div className="rounded-xl bg-white border border-[#e9ecef] px-4 py-2.5 text-sm text-[#7b809a]">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#e9ecef] p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={status === "configuring" ? "Answer the question above..." : "Describe changes you'd like..."}
            disabled={sending || status === "generating" || status === "building"}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending || status === "generating" || status === "building"}
            size="sm"
            className="bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-white px-4"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
