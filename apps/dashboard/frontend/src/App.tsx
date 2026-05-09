/**
import './styles/globals';
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
import SessionsPage from "@/pages/SessionsPage";
import CronPage from "@/pages/CronPage";
import ProfilesPage from "@/pages/ProfilesPage";
import AppStorePage from "@/pages/AppStorePage";
import FileExplorerPage from "@/pages/FileExplorerPage";
import ToolManagerPage from "@/pages/ToolManagerPage";
import SettingsPage from "@/pages/SettingsPage";
import ObservabilityPage from "@/pages/ObservabilityPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import ConfigPage from "@/pages/ConfigPage";
import ChatPage from "@/pages/ChatPage";
import EnvPage from "@/pages/EnvPage";
import LogsPage from "@/pages/LogsPage";
import ModelsPage from "@/pages/ModelsPage";
import DocsPage from "@/pages/DocsPage";
import { isDashboardEmbeddedChatEnabled } from "@/lib/dashboard-flags";
import { I18nContext } from "@/i18n";

function RootRedirect() {
  return <Navigate to="/containers" replace />;
}

export default function App() {
  const [chatOpen, setChatOpen] = useState(true);
  const toggleChat = useCallback(() => setChatOpen((v) => !v), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  return (
    <div className="flex flex-col h-screen bg-[#FFF5E6] text-[#111827] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onToggleChat={toggleChat} chatOpen={chatOpen} />

        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/containers" element={<ContainerPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/cron" element={<CronPage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/observability" element={<ObservabilityPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/appstore" element={<AppStorePage />} />
            <Route path="/files" element={<FileExplorerPage />} />
            <Route path="/tools" element={<ToolManagerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/env" element={<EnvPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/docs" element={<DocsPage />} />
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
