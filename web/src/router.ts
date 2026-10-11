export type Route = { name: "today" } | { name: "history" };

export function parseHash(hash: string): Route {
  const [, name = ""] = hash.replace(/^#/, "").split("/");
  return name === "history" ? { name: "history" } : { name: "today" };
}

export const href = {
  today: () => "#/",
  history: () => "#/history",
};
