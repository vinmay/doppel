export type Route = { name: "today" } | { name: "history" } | { name: "how" };

export function parseHash(hash: string): Route {
  const [, name = ""] = hash.replace(/^#/, "").split("/");
  return name === "history" ? { name: "history" } : name === "how" ? { name: "how" } : { name: "today" };
}

export const href = {
  today: () => "#/",
  history: () => "#/history",
  how: () => "#/how",
};
