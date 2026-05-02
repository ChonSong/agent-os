export interface DashboardTheme {
  id: string;
  name: string;
  colors: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    muted: string;
    border: string;
    error: string;
    success: string;
    warning: string;
  };
}

export interface DashboardThemesResponse {
  themes: DashboardTheme[];
  active: string;
}
