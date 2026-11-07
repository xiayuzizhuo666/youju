import { useEffect, useState } from "react";

export type Route =
  | { name: "ask" }
  | { name: "sign"; token: string }
  | { name: "expand"; token: string }
  | { name: "about" }
  | { name: "api" }
  | { name: "history" };

export function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { name: "ask" };
  if (parts[0] === "sign" && parts[1]) return { name: "sign", token: decodeURIComponent(parts[1]) };
  if (parts[0] === "expand" && parts[1]) return { name: "expand", token: decodeURIComponent(parts[1]) };
  if (parts[0] === "about") return { name: "about" };
  if (parts[0] === "api") return { name: "api" };
  if (parts[0] === "history") return { name: "history" };
  return { name: "ask" };
}

export function navigate(path: string): void {
  history.pushState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.pathname));
    addEventListener("popstate", onChange);
    return () => removeEventListener("popstate", onChange);
  }, []);
  return route;
}
