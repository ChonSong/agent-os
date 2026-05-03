import { ReactNode } from 'react';

export interface PluginSlotProps {
  id?: string;
  name?: string;
  children?: ReactNode;
}

export function PluginSlot({ name, children }: PluginSlotProps): ReactNode {
  return <>{children}</>;
}
