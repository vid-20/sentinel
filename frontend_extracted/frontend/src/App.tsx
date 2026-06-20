import React, { useState, useEffect } from 'react';
import { Shield, Activity, RefreshCw, BarChart2, ShieldAlert, Cpu, CheckCircle2, Sliders, Play, Brain, MapPin, Info, Zap } from 'lucide-react';
import { API_BASE_URL } from './config';
import { MapContainer } from './components/MapContainer';
import { AllocationTable } from './components/AllocationTable';
import { Charts } from './components/Charts';
import { AlertsList } from './components/AlertsList';

const sanitizeLocationNames = (json: any) => {
  if (!json || !json.all_predictions) return json;

  const nameGroups: { [key: string]: string[] } = {};
  json.all_predictions.forEach((pred: any) => {
    const name = pred.location_name || "Bengaluru Sector";
    if (!nameGroups[name]) {
      nameGroups[name] = [];
    }
    if (!nameGroups[name].includes(pred.h3_grid_id)) {
      nameGroups[name].push(pred.h3_grid_id);
    }
  });

  const gridToUniqueName: { [key: string]: string } = {};
  
  Object.keys(nameGroups).forEach((name) => {
    const grids = nameGroups[name];
    if (grids.length <= 1) {
      gridToUniqueName[grids[0]] = name;
    } else {
      const sortedGrids = [...grids].sort();
      sortedGrids.forEach((grid, idx) => {
        const sectorLetter = String.fromCharCode(65 + idx);
        gridToUniqueName[grid] = `${name} (Sector ${sectorLetter})`;
      });
    }
  });

  const renameObject = (obj: any) => {
    if (obj && obj.h3_grid_id && gridToUniqueName[obj.h3_grid_id]) {
      obj.location_name = gridToUniqueName[obj.h3_grid_id];
    }
  };

  if (json.all_predictions) json.all_predictions.forEach(renameObject);
  if (json.officer_allocations) json.officer_allocations.forEach(renameObject);
  if (json.top_risk_zones) json.top_risk_zones.forEach(renameObject);
  if (json.top_impact_zones) json.top_impact_zones.forEach(renameObject);
  if (json.gap_alerts) json.gap_alerts.forEach(renameObject);

  return json;
};

export default function App() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [ingesting, setIngesting] = useState<boolean>(false);
  const [training, setTraining] = useState<boolean>(false);
  const [officerCount, setOfficerCount] = useState<number>(20);
  const [updatingAllocation, setUpdatingAllocation] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<any>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch(`${API_BASE_URL}/api/dashboard-data`);
      if (!res.ok) {
        throw new Error('Failed to fetch dashboard data. Ensure the backend is running and datasets are uploaded.');
      }
      let json = await res.json();
      json = sanitizeLocationNames(json);
      setData(json);
      if (json.all_predictions && json.all_predictions.length > 0) {
        setSelectedZone((prev: any) => {
          if (prev) {
            const match = json.all_predictions.find((p: any) => p.h3_grid_id === prev.h3_grid_id);
            if (match) return match;
          }
          const sorted = [...json.all_predictions].sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0));
          return sorted[0];
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error communicating with Sentinel Backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleIngest = async () => {
    try {
      setIngesting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      const res = await fetch(`${API_BASE_URL}/api/upload-datasets`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || 'Ingestion failed');
      }
      setSuccessMessage(`Ingested ${json.citations_imported} Citations & ${json.astram_events_imported} ASTraM events.`);
      await fetchDashboardData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Dataset processing error.');
    } finally {
      setIngesting(false);
    }
  };

  const handleTrain = async () => {
    try {
      setTraining(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      const res = await fetch(`${API_BASE_URL}/api/train-model`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || 'Failed to refresh intelligence.');
      }
      setSuccessMessage(`Enforcement intelligence refreshed successfully. Calibration AUC: ${json.auc.toFixed(4)}`);
      await fetchDashboardData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Model training error.');
    } finally {
      setTraining(false);
    }
  };

  const handleOfficerChange = async (newVal: number) => {
    setOfficerCount(newVal);
    if (!data || !data.all_predictions) return;
    
    try {
      setUpdatingAllocation(true);
      setErrorMessage(null);
      const res = await fetch(`${API_BASE_URL}/api/allocate-officers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: { available_officers: newVal },
          predictions: data.all_predictions
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to allocate officers');
      }
      
      const json = await res.json();
      console.log(`Allocated ${json.total_allocated} officers out of ${newVal} available`);
      
      // Map unique names from data.all_predictions to new allocations
      const allocationsWithUniqueNames = json.allocations.map((alloc: any) => {
        const pred = data?.all_predictions?.find((p: any) => p.h3_grid_id === alloc.h3_grid_id);
        return {
          ...alloc,
          location_name: pred ? pred.location_name : alloc.location_name
        };
      });

      setData((prev: any) => ({
        ...prev,
        officer_allocations: allocationsWithUniqueNames
      }));
      setSuccessMessage(`✓ Deployed ${json.total_allocated} officers to ${json.allocations.length} zones`);
    } catch (err: any) {
      console.error("Officer allocation error:", err);
      setErrorMessage(`Allocation failed: ${err.message}`);
    } finally {
      setUpdatingAllocation(false);
    }
  };

  const getSelectedZoneDetails = () => {
    if (!selectedZone || !data) return null;
    
    // Find latest prediction details
    const pred = data.all_predictions?.find((p: any) => p.h3_grid_id === selectedZone.h3_grid_id) || selectedZone;
    // Find latest allocation details if any
    const alloc = data.officer_allocations?.find((a: any) => a.h3_grid_id === selectedZone.h3_grid_id);
    
    // Merge them: if allocated in the new allocation, update the officer count and other details!
    const officers = alloc ? alloc.officers_allocated : 0;
    const priority = alloc ? alloc.priority_score : (pred.priority_score || 0);
    const reason = alloc ? alloc.allocation_reason : (pred.allocation_reason || 'Calibrated deployment based on localized road priorities and risk scores.');
    const gap = alloc ? alloc.monitoring_gap : (pred.monitoring_gap || 'none');
    
    // Update recommendation based on the new officer allocation
    let rec = pred.operational_recommendation;
    if (alloc) {
      if (officers > 0) {
        if (gap !== "none") {
          rec = `Deploy officers immediately. High congestion risk (${Math.round(pred.risk_score)}%) combined with weak monitoring coverage (${gap} gap) indicates urgent intervention required.`;
        } else {
          rec = `Deploy officers to manage active hotspots. Road class is ${pred.road_class} with high priority score (${Math.round(priority)}), requiring regular patrol presence to prevent bottleneck build-up.`;
        }
      } else {
        if (pred.risk_score >= 70.0) {
          rec = `Monitor zone via remote feeds. Risk is high (${Math.round(pred.risk_score)}%), but officers are currently deployed to higher-priority arterial segments.`;
        } else {
          rec = "Routine monitoring. Calibrated risk profile indicates low-to-moderate parking violation probability; maintain baseline patrol schedule.";
        }
      }
    }
    
    return {
      ...pred,
      officers_allocated: officers,
      priority_score: priority,
      allocation_reason: reason,
      monitoring_gap: gap,
      operational_recommendation: rec
    };
  };

  const activeZone = getSelectedZoneDetails();

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col">
      {/* Top Banner Header */}
      <header className="border-b border-gray-800 bg-[#0E1322] bg-opacity-70 backdrop-blur-md sticky top-0 z-[1001] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-white font-sans">SENTINEL</h1>
                <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-900 font-bold px-2 py-0.5 rounded">v1.0.0</span>
              </div>
              <p className="text-xs text-gray-400">AI-Powered Traffic Enforcement Intelligence Platform</p>
            </div>
          </div>

          {/* Operational Controls Panel */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTrain}
              disabled={training || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-xs font-bold transition text-white shadow-lg shadow-indigo-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${training ? 'animate-spin' : ''}`} />
              {training ? 'Refreshing Intelligence...' : 'Refresh Intelligence'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Messages */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-950/20 border border-red-900 text-red-200 text-xs md:text-sm flex items-start gap-2 animate-pulse">
            <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <strong className="font-bold">Operational Alert: </strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}
        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900 text-emerald-200 text-xs md:text-sm flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <strong className="font-bold">System Status: </strong>
              <span>{successMessage}</span>
            </div>
          </div>
        )}

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-4 rounded-xl border border-gray-800 shadow-md">
            <div className="text-xxs text-gray-400 uppercase font-semibold">Total Citations Cleaned</div>
            <div className="text-lg md:text-2xl font-extrabold text-white mt-1">
              {loading ? '...' : (data?.total_citations?.toLocaleString() || 0)}
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Historical Parking Citations</p>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-gray-800 shadow-md">
            <div className="text-xxs text-gray-400 uppercase font-semibold">Incident Repository</div>
            <div className="text-lg md:text-2xl font-extrabold text-white mt-1">
              {loading ? '...' : (data?.total_astram_incidents?.toLocaleString() || 0)}
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Archived congestion observations</p>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-gray-800 shadow-md">
            <div className="text-xxs text-gray-400 uppercase font-semibold">Spatial Validation</div>
            <div className="text-lg md:text-2xl font-extrabold text-emerald-400 mt-1 flex items-baseline gap-1.5">
              {loading ? '...' : `${data?.validation_metrics?.overlap_percentage || 0}%`}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                data?.validation_metrics?.confidence_level === 'Very High' || data?.validation_metrics?.confidence_level === 'High'
                  ? 'bg-indigo-950 text-indigo-400 border border-indigo-900'
                  : data?.validation_metrics?.confidence_level === 'Medium'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-900'
                  : 'bg-gray-800 text-gray-300 border border-gray-700'
              }`}>
                {data?.validation_metrics?.confidence_level === 'Very High' || data?.validation_metrics?.confidence_level === 'High'
                  ? 'Validation Signal'
                  : data?.validation_metrics?.confidence_level === 'Medium'
                  ? 'Moderate correlation'
                  : 'Observed overlap'}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Predicted Hotspot Accuracy</p>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-gray-800 shadow-md">
            <div className="text-xxs text-gray-400 uppercase font-semibold">Average Risk Index</div>
            <div className="text-lg md:text-2xl font-extrabold text-indigo-400 mt-1">
              {loading ? '...' : `${data?.average_risk_score || 0}%`}
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">City-wide Risk Matrix Index</p>
          </div>
        </div>

        {/* Insight Discovery Cards */}
        {!loading && data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-r from-blue-950/20 to-indigo-950/20 border border-indigo-900/40 rounded-xl p-4 shadow-sm hover:border-indigo-750/60 transition duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xxs text-indigo-400 font-bold uppercase tracking-wider font-mono">Violations Concentration</span>
                <span className="p-1 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-900 text-[10px] font-extrabold">Dynamic Metric</span>
              </div>
              <p className="text-sm font-extrabold text-white mt-2">
                Top 10 high-risk zones hold {((data.all_predictions?.reduce((s: number, p: any) => s + (p.historical_density || 0), 0) || 0) / (data.total_citations || 1) * 100).toFixed(2)}% of city-wide violations.
              </p>
              <p className="text-xxs text-gray-400 mt-1">High congestion risk zones require targeted, non-uniform officer deployments.</p>
            </div>

            <div className="bg-gradient-to-r from-purple-950/20 to-pink-950/20 border border-purple-900/40 rounded-xl p-4 shadow-sm hover:border-purple-750/60 transition duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xxs text-purple-400 font-bold uppercase tracking-wider font-mono">Road Susceptibility</span>
                <span className="p-1 rounded-lg bg-purple-950 text-purple-400 border border-purple-900 text-[10px] font-extrabold">Road Class</span>
              </div>
              <p className="text-sm font-extrabold text-white mt-2">
                {((data.all_predictions?.filter((p: any) => p.road_class === "Arterial" || p.road_class === "National Highway").length || 0) / (data.all_predictions?.length || 1) * 100).toFixed(0)}% of identified hotspots map to major arterials.
              </p>
              <p className="text-xxs text-gray-400 mt-1">Major transit corridors present the highest capacity reduction risk when obstructed.</p>
            </div>

            <div className="bg-gradient-to-r from-emerald-950/20 to-teal-950/20 border border-emerald-900/40 rounded-xl p-4 shadow-sm hover:border-emerald-750/60 transition duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xxs text-emerald-400 font-bold uppercase tracking-wider font-mono">Incident Correlation Analysis</span>
                <span className="p-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-900 text-[10px] font-extrabold">Validation</span>
              </div>
              <p className="text-sm font-extrabold text-white mt-2">
                {data.validation_metrics?.overlap_percentage}% hotspot correspondence with observed traffic disruption patterns.
              </p>
              <p className="text-xxs text-gray-400 mt-1">Indicates meaningful spatial association between parking violations and traffic disruption.</p>
            </div>
          </div>
        )}

        {/* Map and Allocation Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Map Section (Spans 2 columns on larger screens) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-panel p-4 rounded-xl border border-gray-800 shadow-lg flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
                <div>
                  <h3 className="font-bold text-gray-100 flex items-center gap-1.5 text-sm md:text-base">
                    <Activity className="text-indigo-400 w-5 h-5" />
                    Interactive Risk Hotspots
                  </h3>
                  <p className="text-xxs text-gray-400 mt-0.5">Live visualization of enforcement risks, coverage gaps and patrol deployments.</p>
                </div>

                {/* Officer Allocation Slider */}
                <div className="flex items-center gap-3 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800 self-start">
                  <Sliders className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xxs text-gray-300">Patrols Available:</span>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={officerCount}
                    onChange={(e) => handleOfficerChange(parseInt(e.target.value))}
                    className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-xs font-bold text-blue-400 min-w-[20px] text-center">
                    {officerCount}
                  </span>
                  {data?.officer_allocations && data.officer_allocations.length > 0 && (
                    <>
                      <span className="text-gray-600">→</span>
                      <span className="text-xxs text-gray-300">Deployed:</span>
                      <span className="text-xs font-bold text-green-400">
                        {data.officer_allocations.reduce((sum: number, a: any) => sum + (a.officers_allocated || 0), 0)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="w-full h-[500px] bg-gray-950 rounded-xl border border-gray-850 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-gray-400">Loading spatial intelligence layer...</span>
                </div>
              ) : (
                <MapContainer
                  predictions={data?.all_predictions || []}
                  allocations={data?.officer_allocations || []}
                  gapAlerts={data?.gap_alerts || []}
                  onSelectZone={(zone) => setSelectedZone(zone)}
                  selectedZoneH3={activeZone?.h3_grid_id}
                />
              )}
            </div>
          </div>

          {/* Allocation Panel */}
          <div className="lg:col-span-1">
            {loading ? (
              <div className="w-full h-full min-h-[400px] bg-gray-950 rounded-xl border border-gray-850 flex items-center justify-center">
                <span className="text-xs text-gray-500">Calculating deployments...</span>
              </div>
            ) : (
              <AllocationTable
                allocations={data?.officer_allocations || []}
                onSelectZone={(zone) => setSelectedZone(zone)}
                selectedZoneH3={activeZone?.h3_grid_id}
              />
            )}
          </div>

          {/* Decision Intelligence Panel */}
          <div className="lg:col-span-1">
            {loading ? (
              <div className="w-full h-full min-h-[400px] bg-gray-950 rounded-xl border border-gray-850 flex items-center justify-center">
                <span className="text-xs text-gray-500">Processing explainability metrics...</span>
              </div>
            ) : (
              <div className="glass-panel rounded-xl border border-gray-800 overflow-hidden shadow-lg h-full flex flex-col">
                <div className="p-4 border-b border-gray-800 bg-gray-900 bg-opacity-40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="text-indigo-400 w-5 h-5 flex-shrink-0" />
                    <h3 className="font-bold text-gray-100 text-sm md:text-base">Decision Intelligence</h3>
                  </div>
                  <span className="text-xxs font-mono bg-indigo-950 text-indigo-400 border border-indigo-900 px-2 py-0.5 rounded-full font-bold">
                    Explainability Engine
                  </span>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between overflow-y-auto">
                  {!activeZone ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs py-12 text-center">
                      <Info className="w-8 h-8 mb-2 opacity-50 text-gray-400 animate-pulse" />
                      <span>Select a zone on the map or table to inspect operational reasoning.</span>
                    </div>
                  ) : (
                    <div className="space-y-4 text-left">
                      {/* Zone Header */}
                      <div className="border-b border-gray-850 pb-3">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold font-mono">Selected Hotspot</div>
                        <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5 mt-0.5">
                          <MapPin className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          {activeZone.location_name}
                        </h4>
                        <span className="text-xxs text-gray-500 font-mono mt-1 block">
                          H3 Grid ID: {activeZone.h3_grid_id}
                        </span>
                      </div>

                      {/* Metrics Section */}
                      <div className="grid grid-cols-2 gap-2 text-xxs font-sans">
                        <div className="bg-gray-900 bg-opacity-60 border border-gray-850 p-2 ml-0 rounded-lg">
                          <div className="text-gray-400 font-medium">Risk Score</div>
                          <div className="text-sm font-extrabold text-white mt-0.5 flex items-baseline gap-1">
                            {Math.round(activeZone.risk_score)}%
                          </div>
                        </div>

                        <div className="bg-gray-900 bg-opacity-60 border border-gray-850 p-2 ml-0 rounded-lg">
                          <div className="text-gray-400 font-medium font-sans">Congestion Impact</div>
                          <div className="text-sm font-extrabold text-white mt-0.5">
                            {Math.round(activeZone.impact_score)}
                          </div>
                        </div>

                        <div className="bg-gray-900 bg-opacity-60 border border-gray-850 p-2 ml-0 rounded-lg">
                          <div className="text-gray-400 font-medium">Road Type</div>
                          <div className="text-xs font-extrabold text-white mt-0.5 truncate capitalize">
                            {activeZone.road_type || activeZone.road_class || 'Local'}
                          </div>
                        </div>

                        <div className="bg-gray-900 bg-opacity-60 border border-gray-850 p-2 ml-0 rounded-lg">
                          <div className="text-gray-400 font-medium">Violations Density</div>
                          <div className="text-xs font-extrabold text-white mt-0.5">
                            {(activeZone.historical_density || 0).toLocaleString()}
                          </div>
                        </div>

                        <div className="bg-gray-900 bg-opacity-60 border border-gray-850 p-2 ml-0 rounded-lg">
                          <div className="text-gray-400 font-medium">Validation Overlap</div>
                          <div className="text-xs font-extrabold text-emerald-400 mt-0.5">
                            {data?.validation_metrics?.overlap_percentage || 0}%
                          </div>
                        </div>

                        <div className="bg-gray-900 bg-opacity-60 border border-gray-850 p-2 ml-0 rounded-lg">
                          <div className="text-gray-400 font-medium">Gap Severity</div>
                          <div className="text-xs font-extrabold mt-0.5 uppercase">
                            <span className={
                              activeZone.monitoring_gap === 'high' ? 'text-red-400 font-bold' :
                              activeZone.monitoring_gap === 'medium' ? 'text-amber-400 font-bold' : 'text-emerald-400'
                            }>
                              {activeZone.monitoring_gap === 'high' ? 'HIGH' :
                               activeZone.monitoring_gap === 'medium' ? 'MODERATE' : 'LOW'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Priority Score & Officers Allocated */}
                      <div className="bg-indigo-950/20 border border-indigo-900/50 p-2.5 rounded-lg flex justify-between items-center gap-3">
                        <div>
                          <div className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold font-mono">Priority Score</div>
                          <div className="text-sm font-extrabold text-white flex items-center gap-1.5 mt-0.5">
                            <Zap className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                            {Math.round(activeZone.priority_score)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold font-mono">Patrols Deployed</div>
                          <div className="text-sm font-extrabold text-emerald-400 flex items-center justify-end gap-1.5 mt-0.5">
                            👮 {activeZone.officers_allocated || 0}
                          </div>
                        </div>
                      </div>

                      {/* Reason */}
                      <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg text-xxs leading-relaxed">
                        <div className="text-indigo-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                          <Info className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
                          Decision Rationale
                        </div>
                        <p className="text-gray-300">
                          {activeZone.allocation_reason || 'Calibrated based on localized road priorities and risk scores.'}
                        </p>
                      </div>

                      {/* Operational Recommendation */}
                      <div className="bg-gradient-to-r from-blue-950/20 to-indigo-950/20 border border-blue-900/50 p-3 rounded-lg text-xxs leading-relaxed shadow-inner">
                        <div className="text-blue-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                          <Shield className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
                          Operational Recommendation
                        </div>
                        <p className="text-gray-200 font-medium">
                          {activeZone.operational_recommendation}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Charts and Alerts Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            {loading ? (
              <div className="w-full h-[300px] bg-gray-950 rounded-xl border border-gray-850 flex items-center justify-center">
                <span className="text-xs text-gray-500">Compiling chart series...</span>
              </div>
            ) : (
              <Charts topRiskZones={data?.top_impact_zones || []} />
            )}
          </div>

          <div>
            {loading ? (
              <div className="w-full h-[300px] bg-gray-950 rounded-xl border border-gray-850 flex items-center justify-center">
                <span className="text-xs text-gray-500">Scanning blind spots...</span>
              </div>
            ) : (
              <AlertsList
                alerts={data?.gap_alerts || []}
                onSelectZone={(zone) => setSelectedZone(zone)}
                selectedZoneH3={activeZone?.h3_grid_id}
              />
            )}
          </div>
        </div>
      </main>

      {/* Footer Status Panel */}
      <footer className="border-t border-gray-800 bg-[#070A12] py-4 px-6 text-center text-xxs text-gray-500 flex flex-col sm:flex-row sm:justify-between items-center max-w-7xl w-full mx-auto">
        <p>© 2026 Sentinel Traffic Intelligence Platform. Production-grade hackathon prototype.</p>
        <p className="flex items-center gap-1.5 mt-1 sm:mt-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Real-time enforcement intelligence powered by predictive analytics
        </p>
      </footer>
    </div>
  );
}
