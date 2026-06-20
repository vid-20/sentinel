import React from 'react';
import { AlertTriangle, MapPin, EyeOff, ShieldAlert } from 'lucide-react';

interface AlertsListProps {
  alerts: any[];
  onSelectZone?: (zone: any) => void;
  selectedZoneH3?: string | null;
}

export const AlertsList: React.FC<AlertsListProps> = ({ alerts, onSelectZone, selectedZoneH3 }) => {
  return (
    <div className="glass-panel rounded-xl border border-gray-850 overflow-hidden shadow-lg h-full flex flex-col">
      <div className="p-4 border-b border-gray-800 bg-gray-900 bg-opacity-40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-red-500 w-5 h-5 animate-pulse" />
          <h3 className="font-bold text-gray-100 text-sm md:text-base">Monitoring Coverage Gaps</h3>
        </div>
        <span className="text-xxs font-mono bg-red-950 text-red-400 border border-red-900 px-2.5 py-0.5 rounded-full font-bold">
          {alerts.length} Active Gaps
        </span>
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-[300px]">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-xs">
            <EyeOff className="w-8 h-8 mb-2 opacity-50" />
            <span>No monitoring gaps detected.</span>
            <span>Enforcement matches risk level.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, idx) => {
              const isSelected = selectedZoneH3 === alert.h3_grid_id;
              return (
                <div
                  key={alert.h3_grid_id + idx}
                  className={`p-3 rounded-lg bg-red-950 bg-opacity-10 border hover:bg-opacity-20 hover:border-red-500 transition flex flex-col gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-red-500 shadow-lg shadow-red-500/10 bg-opacity-20'
                      : 'border-red-900 border-opacity-30'
                  }`}
                  onClick={() => onSelectZone && onSelectZone(alert)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                      <span className="text-xs font-bold text-red-200">
                        High Risk Blind Spot
                      </span>
                    </div>
                    <span className="text-[10px] font-mono bg-red-900 bg-opacity-40 text-red-300 px-1.5 py-0.5 rounded">
                      Risk: {Math.round(alert.predicted_risk)}%
                    </span>
                  </div>
                  
                  <p className="text-xxs md:text-xs text-gray-300">
                    {alert.alert}
                  </p>

                  <div className="flex items-center justify-between text-xxs text-gray-400 pt-1 border-t border-gray-800 border-opacity-50 font-mono">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-500" />
                      Grid: {alert.h3_grid_id}
                    </span>
                    <span>
                      Past citations: {alert.citation_frequency}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
