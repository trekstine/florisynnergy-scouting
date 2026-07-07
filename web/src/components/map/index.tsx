"use client";

import dynamic from "next/dynamic";

const Loading = () => (
  <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sm font-medium text-white/80">
    Loading satellite layer…
  </div>
);

export const PressureMap = dynamic(
  () => import("./MapPrimitives").then((m) => m.PressureMap),
  { ssr: false, loading: Loading },
);

export const MappingMap = dynamic(
  () => import("./MapPrimitives").then((m) => m.MappingMap),
  { ssr: false, loading: Loading },
);
