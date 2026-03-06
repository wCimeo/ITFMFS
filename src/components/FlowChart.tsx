import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface FlowChartProps {
  data: { time: string; historical: number; predicted: number }[];
}

export function FlowChart({ data }: FlowChartProps) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
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
            contentStyle={{ backgroundColor: 'var(--tw-bg-opacity, #18181b)', borderColor: 'var(--tw-border-opacity, #27272a)', borderRadius: '8px' }}
            itemStyle={{ color: 'var(--tw-text-opacity, #e4e4e7)' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
          <Line 
            type="monotone" 
            name="历史真实流量"
            dataKey="historical" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            name="LST-GCN 预测流量"
            dataKey="predicted" 
            stroke="#10b981" 
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
