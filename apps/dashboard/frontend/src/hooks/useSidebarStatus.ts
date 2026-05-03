import type { StatusResponse } from '@/lib/api';

export type { StatusResponse };

export function useSidebarStatus(): StatusResponse {
  return {
    active_sessions: 0,
    config_path: '',
    config_version: 1,
    env_path: '',
    gateway_exit_reason: null,
    gateway_health_url: null,
    gateway_pid: null,
    gateway_platforms: {},
    gateway_running: false,
    gateway_state: null,
    gateway_updated_at: null,
    hermes_home: '',
    latest_config_version: 1,
    release_date: '',
    version: '0.0.1',
  };
}
