import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";

/** Shared axis styling for dashboard charts. */
const AXIS_PROPS = {
  stroke: "var(--text-tertiary)",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

export interface ChartPoint {
  label: string;
  value: number;
}

/** Status colours: the same hues the map markers use. */
const STATUS_FILL: Record<string, string> = {
  draft: "var(--chart-draft)",
  completed: "var(--chart-done)",
};

/** Area chart: surveys per day over the last 7 days. */
export function SurveysTrendChart({ points }: { points: ChartPoint[] }) {
  const config = {
    // chart-1 is the palest step in light mode — too faint for a 2px line.
    value: { label: "Surveys", color: "var(--chart-3)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis dataKey="label" tickMargin={8} {...AXIS_PROPS} />
        <YAxis allowDecimals={false} width={28} {...AXIS_PROPS} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* No draw-in animation: it replays on every visit and reads as lag, not polish. */}
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="url(#trend-fill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** Bar chart: surveys broken down by status, each status in its own colour. */
export function SurveysStatusChart({ points }: { points: ChartPoint[] }) {
  const config = {
    value: { label: "Surveys", color: "var(--chart-2)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis dataKey="label" interval={0} tickMargin={8} {...AXIS_PROPS} />
        <YAxis allowDecimals={false} width={28} {...AXIS_PROPS} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.label} fill={STATUS_FILL[p.label.toLowerCase()] ?? "var(--color-value)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
