/**
 * CasaOS-style shell for agent-os.
 *
 * Layout:
 *   ┌──────────┬───────────────────────────────┐
 *   │ Sidebar  │         Main Area              │
 *   │ (icons)  │    (switches on nav click)      │
 *   │          ├───────────────────────────────┤
 *   │          │   Collapsible Chat Panel      │
 *   └──────────┴───────────────────────────────┘
 */

import { useState, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { StatusBar } from "@/components/StatusBar";
import ContainerPage from "@/pages/ContainerPage";
import AppStorePage from "@/pages/AppStorePage";
import FileExplorerPage from "@/pages/FileExplorerPage";
import ToolManagerPage from "@/pages/ToolManagerPage";
import SettingsPage from "@/pages/SettingsPage";
import { isDashboardEmbeddedChatEnabled } from "@/lib/dashboard-flags";

function RootRedirect() {
  return <Navigate to="/containers" replace />;
}

export default function App() {
  const [chatOpen, setChatOpen] = useState(true);
  const toggleChat = useCallback(() => setChatOpen((v) => !v), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  return (
    <div className="flex flex-col h-screen bg-[#0a0e14] text-[#e8e6e3] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onToggleChat={toggleChat} chatOpen={chatOpen} />

        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/containers" element={<ContainerPage />} />
            <Route path="/appstore" element={<AppStorePage />} />
            <Route path="/files" element={<FileExplorerPage />} />
            <Route path="/tools" element={<ToolManagerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/containers" replace />} />
          </Routes>
        </main>

        {isDashboardEmbeddedChatEnabled() && (
          <ChatPanel open={chatOpen} onClose={closeChat} />
        )}
      </div>

      <StatusBar />
    </div>
  );
}
