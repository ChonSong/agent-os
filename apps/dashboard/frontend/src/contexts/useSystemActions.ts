import { createContext, useContext } from 'react';
import type { ActionStatusResponse } from '@/lib/api';

export interface SystemAction {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  log?: string;
}

export interface SystemActionsContextValue {
  activeAction: string | null;
  actionStatus: ActionStatusResponse | null;
  dismissLog: () => void;
}

const SystemActionsContext = createContext<SystemActionsContextValue>({
  activeAction: null,
  actionStatus: null,
  dismissLog: () => {},
});

export const useSystemActions = () => useContext(SystemActionsContext);
