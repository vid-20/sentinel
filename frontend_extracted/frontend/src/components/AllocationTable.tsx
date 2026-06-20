import React, { useState } from 'react';
import { Shield, MapPin, Percent, Zap, ChevronDown, ChevronUp, Info } from 'lucide-react';

interface AllocationTableProps {
  allocations: any[];
  onSelectZone?: (zone: any) => void;
  selectedZoneH3?: string | null;
}

export const AllocationTable: React.FC<AllocationTableProps> = ({ allocations, onSelectZone, selectedZoneH3 }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (idx: number) => {
    setExpandedIndex(expandedIndex === idx ? null : idx);
  };

  return (
    <div className="glass-panel rounded-xl border border-gray-800 overflow-hidden shadow-lg h-full flex flex-col">
      <div className="p-4 border-b border-gray-800 bg-gray-900 bg-opacity-40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="text-blue-500 w-5 h-5" />
          <h3 className="font-bold text-gray-100 text-sm md:text-base">Optimal Officer Allocation</h3>
        </div>
        <span className="text-xxs font-mono bg-blue-950 text-blue-400 border border-blue-900 px-2 py-0.5 rounded-full font-bold">
          Dynamic Optimization
        </span>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {allocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-xs">
            <span>No active allocations.</span>
            <span>Load datasets or run allocation.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {allocations.map((alloc, idx) => (
              <div
                key={alloc.h3_grid_id + idx}
                className={`rounded-lg bg-gray-900 bg-opacity-60 border transition overflow-hidden ${
                  selectedZoneH3 === alloc.h3_grid_id ? 'border-blue-500 shadow-md shadow-blue-500/10' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                {/* Header/Main Row */}
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => {
                    toggleExpand(idx);
                    if (onSelectZone) onSelectZone(alloc);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-950 border border-blue-900 flex items-center justify-center font-bold text-blue-400 text-sm flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="text-xs md:text-sm font-bold text-white flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {alloc.location_name}
                      </h4>
                      <span className="text-xxs text-gray-400 font-mono">
                        Grid: {alloc.h3_grid_id}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right flex-shrink-0">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Priority</div>
                      <div className="text-xs font-bold text-blue-400 flex items-center justify-end gap-1">
                        <Zap className="w-3 h-3" />
                        {Math.round(alloc.priority_score)}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Risk</div>
                      <div className="text-xs font-bold text-white flex items-center justify-end gap-1">
                        <Percent className="w-3 h-3 text-gray-400" />
                        {Math.round(alloc.risk_score)}
                      </div>
                    </div>

                    <div className="bg-blue-600 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg shadow-md min-w-[70px] text-center">
                      👮 {alloc.officers_allocated}
                    </div>

                    <div className="text-gray-400 hover:text-white transition">
                      {expandedIndex === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Explainability / Expandable Section */}
                {expandedIndex === idx && (
                  <div className="px-3 pb-3 pt-2 border-t border-gray-800 bg-gray-950 bg-opacity-40 text-xxs font-sans text-gray-300">
                    <div className="flex items-center gap-1.5 font-bold text-blue-400 uppercase tracking-wider mb-2">
                      <Info className="w-3.5 h-3.5 text-blue-400" />
                      Why this deployment?
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-gray-900 bg-opacity-40 border border-gray-800 p-2.5 rounded-lg mb-2 text-xxs font-mono">
                      <div>
                        <span className="text-gray-500">Risk Score:</span>{' '}
                        <span className="font-bold text-white">{Math.round(alloc.risk_score)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Impact Score:</span>{' '}
                        <span className="font-bold text-white">{Math.round(alloc.impact_score)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Road Type:</span>{' '}
                        <span className="font-bold text-white uppercase">{alloc.road_type || 'Local'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Citations Density:</span>{' '}
                        <span className="font-bold text-white">{(alloc.historical_density || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Monitoring Gap:</span>{' '}
                        <span className={`font-bold uppercase ${
                          alloc.monitoring_gap === 'high' ? 'text-red-400' :
                          alloc.monitoring_gap === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {alloc.monitoring_gap === 'high' ? 'HIGH' :
                           alloc.monitoring_gap === 'medium' ? 'MODERATE' : 'LOW'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Priority Score:</span>{' '}
                        <span className="font-bold text-blue-400">{Math.round(alloc.priority_score)}</span>
                      </div>
                    </div>

                    <div className="p-2 bg-blue-950 bg-opacity-20 border border-blue-900 border-opacity-30 rounded-lg text-gray-200">
                      <strong>Reason: </strong>
                      <span>{alloc.allocation_reason || 'Calibrated deployment based on localized road priorities and risk scores.'}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
