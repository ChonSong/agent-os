/** Shared types across agent-os dashboard and backend. */

export interface AIEEvent {
  type: 'delegation' | 'tool_call' | 'assumption' | 'drift' | 'circuit_open' | 'task_complete';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface AgentResponse {
  content: string;
  tools_used: string[];
  messages: unknown[];
}

export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
