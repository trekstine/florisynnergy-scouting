import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FloriSynergy IPM — Spray Approval Sheet",
};

/**
 * The approval sheet sits outside the (dash) layout on purpose: it is a
 * document, not a screen. No sidebar, no topbar, nothing that would land on
 * the page when someone hits Print. Providers come from the root layout.
 */
export default function ApprovalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
