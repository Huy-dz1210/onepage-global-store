"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);

export function FlowChart({ data }: { data: { day: string; inflow: number; outflow: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={1}>
          <CartesianGrid vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} tickMargin={8} minTickGap={16} />
          <YAxis tickFormatter={usd} tickLine={false} axisLine={false} fontSize={11} width={56} />
          <Tooltip formatter={(v) => usd(Number(v))} cursor={{ fill: "#f5f5f4" }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="inflow" name="Tiền vào (USD eq.)" fill="#059669" radius={[3, 3, 0, 0]} />
          <Bar dataKey="outflow" name="Tiền ra (USD eq.)" fill="#a8a29e" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
