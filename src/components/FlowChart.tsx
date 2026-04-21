import React from 'react';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

interface FlowChartPoint {
  hour: number;
  time: string;
  historical: number | null;
  predicted: number | null;
  periodLabel: string;
}

interface PeakWindow {
  key: string;
  label: string;
  startHour: number;
  endHour: number;
}

interface FlowChartProps {
  data: FlowChartPoint[];
  peaks: PeakWindow[];
  range: { startIndex: number; endIndex: number };
  onRangeChange: (range: { startIndex: number; endIndex: number }) => void;
}

export function FlowChart({ data, peaks, range, onRangeChange }: FlowChartProps) {
  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-zinc-800" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="currentColor"
            className="text-gray-500 dark:text-zinc-500"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="currentColor"
            className="text-gray-500 dark:text-zinc-500"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number | null, name: string) => [`${value ?? '--'} 辆/小时`, name]}
            labelFormatter={(label, payload) => {
              const point = payload?.[0]?.payload as FlowChartPoint | undefined;
              return point ? `${label} 路 ${point.periodLabel}` : label;
            }}
            contentStyle={{
              backgroundColor: '#18181b',
              borderColor: '#27272a',
              borderRadius: '10px',
              color: '#f4f4f5'
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />

          <Line
            type="monotone"
            name="历史真实流量"
            dataKey="historical"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 6 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            name="模型预测结果"
            dataKey="predicted"
            stroke="#10b981"
            strokeWidth={2.5}
            strokeDasharray="6 5"
            dot={{ r: 4, strokeWidth: 0, fill: '#10b981' }}
            activeDot={{ r: 6 }}
            connectNulls={false}
          />

          <Brush
            dataKey="time"
            height={24}
            stroke="#10b981"
            travellerWidth={10}
            startIndex={range.startIndex}
            endIndex={range.endIndex}
            onChange={(nextRange) => {
              if (
                typeof nextRange?.startIndex === 'number' &&
                typeof nextRange?.endIndex === 'number'
              ) {
                onRangeChange({
                  startIndex: nextRange.startIndex,
                  endIndex: nextRange.endIndex
                });
              }
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
