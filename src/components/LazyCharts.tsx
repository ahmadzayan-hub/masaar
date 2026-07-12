"use client";
// Code-splits recharts out of the initial JS so first paint is fast.
// Each chart is replaced by a sized skeleton until it hydrates.
import dynamic from "next/dynamic";

function Skeleton({ h }: { h: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-gradient-to-br from-gray-100 to-gray-50"
      style={{ height: h }}
      aria-hidden
    />
  );
}

export const RevenueAreaChart = dynamic(
  () => import("./charts").then((m) => m.RevenueAreaChart),
  { ssr: false, loading: () => <Skeleton h={220} /> }
);
export const OrdersBarChart = dynamic(
  () => import("./charts").then((m) => m.OrdersBarChart),
  { ssr: false, loading: () => <Skeleton h={180} /> }
);
export const FunnelBarChart = dynamic(
  () => import("./charts").then((m) => m.FunnelBarChart),
  { ssr: false, loading: () => <Skeleton h={220} /> }
);
export const TopProductsChart = dynamic(
  () => import("./charts").then((m) => m.TopProductsChart),
  { ssr: false, loading: () => <Skeleton h={220} /> }
);
export const PlatformPie = dynamic(
  () => import("./charts").then((m) => m.PlatformPie),
  { ssr: false, loading: () => <Skeleton h={220} /> }
);
export const StackedStatusChart = dynamic(
  () => import("./charts").then((m) => m.StackedStatusChart),
  { ssr: false, loading: () => <Skeleton h={200} /> }
);
