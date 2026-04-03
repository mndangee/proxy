import type { Activity } from "@/types";

export { slugify } from "@/libs/slugify";
export { getProjectBySlug, getStoredProjects, getProjectRouteSlug, getProjectHref } from "@/libs/projects/store";

export const mockActivities: Activity[] = [
  { id: "1", message: "User Auth API deployed to production", apiPath: "/api/v2/auth", timeAgo: "2 hours ago" },
  { id: "2", message: "Inventory Alpha schema updated", apiPath: "/api/v1/inventory/stocks", timeAgo: "5 hours ago" },
  { id: "3", message: "E-commerce Mock endpoints configured", apiPath: "/api/v2/products", timeAgo: "12 hours ago" },
];
