export const ROUTES = {
  home: "/",
  templates: "/templates",
  create: "/create",
  editor: "/editor",
  export: "/export",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
