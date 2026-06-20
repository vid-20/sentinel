import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { BarChart3 } from 'lucide-react';

interface ChartsProps {
  topRiskZones: any[];
}

export const Charts: React.FC<ChartsProps> = ({ topRiskZones }) => {
  // Map and clean data for recharts
  const chartData = topRiskZones.slice(0, 7).map((z) => {
    return {
      name: z.location_name || `Grid ${z.h3_grid_id.substring(8, 12)}`,
      'Risk Score': Math.round(z.risk_score),
      'Impact Score': Math.round(z.impact_score)
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-950 border border-gray-800 p-3 rounded-lg shadow-xl text-xs font-sans">
          <p className="font-bold text-gray-200 mb-2">{label}</p>
          {payload.map((p: any, idx: number) => (
            <div key={idx} className="flex justify-between gap-4 py-0.5">
              <span style={{ color: p.color }}>{p.name}:</span>
              <span className="font-mono font-bold text-white">{p.value}%</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel rounded-xl border border-gray-800 overflow-visible shadow-lg h-full flex flex-col">
      <div className="p-4 border-b border-gray-800 bg-gray-900 bg-opacity-40 flex items-center gap-2">
        <BarChart3 className="text-primary-500 w-5 h-5" />
        <h3 className="font-bold text-gray-100 text-sm md:text-base">Risk vs. Congestion Impact Comparison</h3>
      </div>
      
      <div className="p-6 flex-1 min-h-[400px] flex items-center justify-center overflow-visible">
        {chartData.length === 0 ? (
          <div className="text-gray-500 text-xs text-center">
            No chart data available. Load dataset first.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 70 }}
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="#6B7280" 
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-45}
                textAnchor="end"
                tickFormatter={(value) =>
                  value.length > 14
                    ? value.slice(0, 14) + "..."
                    : value
                }
              />
              <YAxis 
                stroke="#6B7280" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 10, color: '#9CA3AF' }}
              />
              <Bar 
                dataKey="Risk Score" 
                fill="#EF4444" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={30}
              />
              <Bar 
                dataKey="Impact Score" 
                fill="#8B5CF6" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={30}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
