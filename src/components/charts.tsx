"use client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";

const BRAND = "#111827"; // gray-900
const ACCENT = "#ec4899"; // pink-500
const SOFT = "#f9a8d4";   // pink-300

export function RevenueAreaChart({ data }: { data: { day: string; aed: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="aedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" />
        <YAxis tickFormatter={(v) => `${v}`} />
        <Tooltip
          formatter={(v: number) => [`AED ${v.toLocaleString()}`, "Revenue"]}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="aed" stroke={ACCENT} fill="url(#aedFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OrdersBarChart({ data }: { data: { day: string; orders: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" />
        <YAxis allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="orders" fill={BRAND} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FunnelBarChart({ data }: { data: { stage: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 12, left: 60, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="stage" width={120} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="value" fill={ACCENT} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopProductsChart({ data }: { data: { name: string; orders: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={60} />
        <YAxis allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="orders" fill={BRAND} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlatformPie({ data }: { data: { name: string; value: number }[] }) {
  const palette = [BRAND, ACCENT, "#0ea5e9", "#22c55e", "#f59e0b", "#a855f7"];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Legend />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function StackedStatusChart({ data }: { data: { day: string; paid: number; pending: number; complaints: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" />
        <YAxis allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend />
        <Bar dataKey="paid" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="pending" stackId="a" fill="#f59e0b" />
        <Bar dataKey="complaints" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export { SOFT };
