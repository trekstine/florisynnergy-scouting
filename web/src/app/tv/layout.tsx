import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FloriSynergy IPM — Farm Wallboard",
};

/**
 * The wallboard deliberately sits outside the (dash) layout: no sidebar, no
 * topbar, no navigation at all. It's a read-only display for an office TV,
 * so every pixel goes to the data. Providers come from the root layout.
 */
export default function TvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
