import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Florisynergy IPM — Documents",
};

/**
 * Printable documents — the approval sheet and the chemical application
 * report. They sit outside the (dash) layout on purpose: these are documents,
 * not screens, so nothing lands on the page when someone hits Print. Providers
 * come from the root layout.
 */
export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
