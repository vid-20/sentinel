import React, { useEffect, useRef } from 'react';

// Access Leaflet loaded globally in index.html
declare const L: any;

interface MapContainerProps {
  predictions: any[];
  allocations: any[];
  gapAlerts: any[];
  onSelectZone?: (zone: any) => void;
  selectedZoneH3?: string | null;
}

export const MapContainer: React.FC<MapContainerProps> = ({ predictions, allocations, gapAlerts, onSelectZone, selectedZoneH3 }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('Leaflet is not loaded on the window object.');
      return;
    }

    // Initialize map if not already done
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false
      }).setView([12.9716, 77.5946], 12); // Centered on Bengaluru

      // Add a clean base map tile layer. Styled in CSS to be inverted dark-mode
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
      }).addTo(mapInstanceRef.current);

      layerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    }

    // Clear previous markers
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers();
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    // 1. Draw Risk Heat Overlay (from Predictions)
    predictions.forEach((pred) => {
      // Skip if coordinates are invalid
      if (!pred.latitude || !pred.longitude || isNaN(pred.latitude) || isNaN(pred.longitude)) {
        console.warn('Skipping prediction with invalid coordinates:', pred);
        return;
      }

      const risk = pred.risk_score;
      let color = '#10B981'; // Low (Emerald)
      if (risk >= 75) color = '#8B5CF6'; // Critical (Purple)
      else if (risk >= 60) color = '#EF4444'; // High (Red)
      else if (risk >= 40) color = '#F59E0B'; // Medium (Amber)

      // Add semi-transparent circle for risk zone
      const isSelected = selectedZoneH3 === pred.h3_grid_id;
      const circle = L.circle([pred.latitude, pred.longitude], {
        color: isSelected ? '#3B82F6' : color,
        fillColor: color,
        fillOpacity: isSelected ? 0.45 : 0.25,
        radius: 350,
        weight: isSelected ? 3.5 : 1
      });

      circle.on('click', () => {
        if (onSelectZone) onSelectZone(pred);
      });

      // Construct popup info
      const popupContent = `
        <div class="p-2 font-sans">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs uppercase font-semibold text-gray-400">H3 Hexagon ID</span>
            <span class="text-xs font-mono bg-gray-800 px-1 py-0.5 rounded text-gray-300">${pred.h3_grid_id}</span>
          </div>
          <h4 class="text-sm font-bold text-gray-200 mb-2">${pred.road_class} Segment</h4>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-gray-800 p-1.5 rounded">
              <div class="text-gray-400">Risk Score</div>
              <div class="text-sm font-bold text-white">${Math.round(risk)}%</div>
            </div>
            <div class="bg-gray-800 p-1.5 rounded">
              <div class="text-gray-400">Congestion Impact</div>
              <div class="text-sm font-bold text-white">${Math.round(pred.impact_score)}</div>
            </div>
          </div>
          <div class="mt-2 text-xxs text-gray-400">
            Road Category: ${pred.road_category} | One-way: ${pred.is_one_way ? 'Yes' : 'No'}
          </div>
        </div>
      `;

      circle.bindPopup(popupContent);
      layerGroup.addLayer(circle);
    });

    // 2. Add Enforcement Officer Allocation Markers
    allocations.forEach((alloc) => {
      // Skip if coordinates are invalid
      if (!alloc.latitude || !alloc.longitude || isNaN(alloc.latitude) || isNaN(alloc.longitude)) {
        console.warn('Skipping allocation with invalid coordinates:', alloc);
        return;
      }

      // Create a custom div icon showing officer badge
      const icon = L.divIcon({
        html: `
          <div class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 border-2 border-white text-white shadow-lg font-bold text-xs animate-bounce">
            👮
          </div>
        `,
        className: 'custom-officer-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([alloc.latitude, alloc.longitude], { icon: icon });

      marker.on('click', () => {
        if (onSelectZone) {
          const matchingPred = predictions.find(p => p.h3_grid_id === alloc.h3_grid_id);
          onSelectZone(matchingPred || alloc);
        }
      });

      const popupContent = `
        <div class="p-2 font-sans">
          <div class="text-xs font-semibold text-blue-400 uppercase mb-1">Enforcement Patrol</div>
          <h4 class="text-sm font-bold text-white mb-1">${alloc.location_name}</h4>
          <div class="bg-blue-950 border border-blue-800 rounded p-2 text-xs mb-2">
            <div class="flex justify-between font-bold text-white">
              <span>Officers Deployed:</span>
              <span class="text-blue-300">${alloc.officers_allocated} Officers</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-1 text-xxs text-gray-400">
            <div>Priority Score: ${Math.round(alloc.priority_score)}</div>
            <div>Risk Score: ${Math.round(alloc.risk_score)}%</div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      layerGroup.addLayer(marker);
    });

    // 3. Add Monitoring Gap Alert Indicators
    gapAlerts.forEach((gap) => {
      // Skip if coordinates are invalid
      if (!gap.latitude || !gap.longitude || isNaN(gap.latitude) || isNaN(gap.longitude)) {
        console.warn('Skipping gap alert with invalid coordinates:', gap);
        return;
      }

      const icon = L.divIcon({
        html: `
          <div class="flex items-center justify-center w-6 h-6 rounded-full bg-red-600 border border-white text-white shadow-lg font-bold text-xs animate-pulse glow-purple">
            ⚠️
          </div>
        `,
        className: 'custom-gap-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([gap.latitude, gap.longitude], { icon: icon });

      marker.on('click', () => {
        if (onSelectZone) {
          const matchingPred = predictions.find(p => p.h3_grid_id === gap.h3_grid_id);
          onSelectZone(matchingPred || gap);
        }
      });

      const popupContent = `
        <div class="p-2 font-sans">
          <div class="text-xs font-semibold text-red-400 uppercase mb-1">Coverage Gap Alert</div>
          <h4 class="text-sm font-bold text-white mb-2">Sector Under-Monitored</h4>
          <div class="bg-red-950 border border-red-900 rounded p-1.5 text-xs text-red-200 mb-1">
            Predicted Risk: <strong class="text-white">${Math.round(gap.predicted_risk)}%</strong><br/>
            Historical Patrols: <strong class="text-white">${gap.citation_frequency} citations</strong>
          </div>
          <p class="text-xxs text-gray-400">Enforcement activity is in the bottom 20% despite high parking congestion risk.</p>
        </div>
      `;

      marker.bindPopup(popupContent);
      layerGroup.addLayer(marker);
    });

  }, [predictions, allocations, gapAlerts, onSelectZone, selectedZoneH3]);

  // Clean up map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[500px] rounded-xl overflow-hidden border border-gray-800 dark-leaflet-map shadow-2xl">
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-4 z-[1000] bg-gray-900 bg-opacity-90 border border-gray-800 rounded-lg p-3 text-xs flex gap-4 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-risk-low opacity-60"></span>
          <span className="text-gray-300 text-xxs">Low Risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-risk-medium opacity-60"></span>
          <span className="text-gray-300 text-xxs">Medium</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-risk-high opacity-60"></span>
          <span className="text-gray-300 text-xxs">High</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-risk-critical opacity-60"></span>
          <span className="text-gray-300 text-xxs">Critical</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px]">👮</span>
          <span className="text-gray-300 text-xxs">Officer Deployment</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[10px]">⚠️</span>
          <span className="text-gray-300 text-xxs">Monitoring Gap</span>
        </div>
      </div>
    </div>
  );
};
