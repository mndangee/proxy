/** 프로젝트 이름 → URL path용 slug (예: "E-commerce Mock" → "e-commerce-mock") */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
