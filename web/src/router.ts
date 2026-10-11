export type Route = { name: "today" } | { name: "history" } | { name: "how" } | { name: "demo" };

export function parseHash(hash: string): Route {
  const [, name = ""] = hash.replace(/^#/, "").split("/");
  if (name === "history" || name === "how" || name === "demo") return { name };
  return { name: "today" };
}

export const href = {
  today: () => "#/",
  history: () => "#/history",
  how: () => "#/how",
  demo: () => "#/demo",
};
