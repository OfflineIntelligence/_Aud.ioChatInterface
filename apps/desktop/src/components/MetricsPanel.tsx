import React, { useState, useEffect, useCallback } from 'react';
import { getApiBaseSync } from '../api/backendUrl';
import { ArrowLeft, Cpu, HardDrive, Monitor, Activity, RefreshCw, Database, Zap } from 'lucide-react';

interface SystemMetrics {
  cpu: {
    usage_percent: number;
    cores: number;
    model_name: string;
    frequency_mhz: number;
    per_core_usage: number[];
  };
  gpu: {
    available: boolean;
    name: string;
    usage_percent: number;
    vram_total_gb: number;
    vram_used_gb: number;
    temperature_c: number;
  };
  memory: {
    total_gb: number;
    used_gb: number;
    available_gb: number;
    usage_percent: number;
  };
  storage: {
    total_gb: number;
    used_gb: number;
    available_gb: number;
    models_size_gb: number;
  };
  inference: {
    active_model: string | null;
    tokens_per_second: number;
    total_requests: number;
    avg_latency_ms: number;
    device: string; // "GPU", "CPU", "CPU+GPU"
    gpu_layers: number;
  };
}

// Metric response types from backend
interface LiveMetricsResponse {
  cpu_usage_percent: number;
  per_core_usage?: number[];
  cpu_model_name?: string;
  cpu_frequency_mhz?: number;
  cpu_cores?: number;
  gpu_available: boolean;
  gpu_name?: string;
  gpu_usage_percent: number;
  gpu_vram_total_gb: number;
  gpu_vram_used_gb: number;
  gpu_temperature_c: number;
  memory_total_gb: number;
  memory_used_gb: number;
  memory_available_gb: number;
  inference_device?: string;
  gpu_layers_offloaded?: number;
}

interface HardwareInfoResponse {
  cpu_cores: number;
  gpu_available: boolean;
  gpu_vram_gb?: number;
  total_ram_gb: number;
  available_ram_gb: number;
  storage_used_bytes: number;
  storage_available_bytes: number;
}

// Static components extracted outside render to prevent state resets
const ProgressBar: React.FC<{ percent: number; color?: string; label?: string }> = ({ percent, color = 'var(--accent)', label }) => (
  <div>
    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(Math.max(percent, 0), 100)}%`, height: '100%', backgroundColor: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
    </div>
    {label && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>}
  </div>
);

const MetricCard: React.FC<{ title: string; icon: React.ReactNode; badge?: string; badgeColor?: string; children: React.ReactNode }> = ({ title, icon, badge, badgeColor, children }) => (
  <div style={{
    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
    borderRadius: '12px', padding: '16px', marginBottom: '12px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
      {icon}
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
      {badge && (
        <span style={{
          fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
          backgroundColor: badgeColor || 'var(--bg-tertiary)', color: 'white', fontWeight: 600,
        }}>{badge}</span>
      )}
    </div>
    {children}
  </div>
);

const MetricsPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      // Try to fetch from both the old hardware endpoint and the new engines endpoint
      const [liveRes, hwRes, enginesHwRes] = await Promise.all([
        fetch(`${getApiBaseSync()}/metrics/system`).catch(() => null),
        fetch(`${getApiBaseSync()}/hardware/info`).catch(() => null),
        fetch(`${getApiBaseSync()}/engines/hardware/info`).catch(() => null),
      ]);

      let live: LiveMetricsResponse | null = null;
      let hw: HardwareInfoResponse | null = null;
      let enginesHw: any | null = null; // Use any type since we're not sure of the exact structure

      if (liveRes?.ok) live = await liveRes.json();
      if (hwRes?.ok) hw = await hwRes.json();
      if (enginesHwRes?.ok) enginesHw = await enginesHwRes.json();

      if (live) {
        // Combine system metrics with hardware info from either source
        const hwInfo = hw || enginesHw;
        const storageTotal = hwInfo ? (hwInfo.storage_used_bytes + hwInfo.storage_available_bytes) / (1024 ** 3) : 0;
        const storageUsed = hwInfo ? hwInfo.storage_used_bytes / (1024 ** 3) : 0;
        const storageAvailable = hwInfo ? hwInfo.storage_available_bytes / (1024 ** 3) : 0;

        setMetrics({
          cpu: {
            usage_percent: live.cpu_usage_percent,
            cores: live.per_core_usage?.length || (hwInfo?.cpu_cores ?? 0),
            model_name: live.cpu_model_name || 'System CPU',
            frequency_mhz: live.cpu_frequency_mhz || 0,
            per_core_usage: live.per_core_usage || [],
          },
          gpu: {
            available: live.gpu_available,
            name: live.gpu_name || (live.gpu_available ? 'GPU' : 'Not detected'),
            usage_percent: live.gpu_usage_percent,
            vram_total_gb: live.gpu_vram_total_gb,
            vram_used_gb: live.gpu_vram_used_gb,
            temperature_c: live.gpu_temperature_c,
          },
          memory: {
            total_gb: live.memory_total_gb,
            used_gb: live.memory_used_gb,
            available_gb: live.memory_available_gb,
            usage_percent: live.memory_total_gb > 0 ? (live.memory_used_gb / live.memory_total_gb) * 100 : 0,
          },
          storage: {
            total_gb: storageTotal,
            used_gb: storageUsed,
            available_gb: storageAvailable,
            models_size_gb: storageUsed,
          },
          inference: {
            active_model: null,
            tokens_per_second: 0,
            total_requests: 0,
            avg_latency_ms: 0,
            device: live.inference_device || 'CPU',
            gpu_layers: live.gpu_layers_offloaded || 0,
          },
        });
      } else if (hw || enginesHw) {
        // Use whichever hardware info is available
        const hwInfo = hw || enginesHw;
        
        setMetrics({
          cpu: {
            usage_percent: 0,
            cores: hwInfo.cpu_cores || 0,
            model_name: 'System CPU',
            frequency_mhz: 0,
            per_core_usage: [],
          },
          gpu: {
            available: hwInfo.gpu_available || false,
            name: (hwInfo.gpu_available || (hwInfo.profile?.gpu_info?.vendor)) ? (hwInfo.profile?.gpu_info?.vendor + ' ' + hwInfo.profile?.gpu_info?.model || 'GPU') : 'Not detected',
            usage_percent: 0,
            vram_total_gb: hwInfo.gpu_vram_gb || hwInfo.profile?.gpu_info?.memory_gb || 0,
            vram_used_gb: 0,
            temperature_c: 0,
          },
          memory: {
            total_gb: hwInfo.total_ram_gb || hwInfo.profile?.total_memory_gb || 0,
            used_gb: (hwInfo.total_ram_gb || hwInfo.profile?.total_memory_gb || 0) - (hwInfo.available_ram_gb || hwInfo.profile?.available_memory_gb || 0),
            available_gb: hwInfo.available_ram_gb || hwInfo.profile?.available_memory_gb || 0,
            usage_percent: (hwInfo.total_ram_gb || hwInfo.profile?.total_memory_gb || 0) > 0 ? 
              (((hwInfo.total_ram_gb || hwInfo.profile?.total_memory_gb || 0) - (hwInfo.available_ram_gb || hwInfo.profile?.available_memory_gb || 0)) / (hwInfo.total_ram_gb || hwInfo.profile?.total_memory_gb || 0)) * 100 : 0,
          },
          storage: {
            total_gb: (hwInfo.storage_used_bytes + hwInfo.storage_available_bytes) / (1024 ** 3),
            used_gb: hwInfo.storage_used_bytes / (1024 ** 3),
            available_gb: hwInfo.storage_available_bytes / (1024 ** 3),
            models_size_gb: hwInfo.storage_used_bytes / (1024 ** 3),
          },
          inference: {
            active_model: null,
            tokens_per_second: 0,
            total_requests: 0,
            avg_latency_ms: 0,
            device: 'CPU',
            gpu_layers: 0,
          },
        });
      }
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Fetch metrics on panel open - the async callback pattern avoids
    // the lint rule about calling setState synchronously in effects.
    const load = async () => { await fetchMetrics(); };
    load();
  }, [isOpen, fetchMetrics]);

  useEffect(() => {
    if (isOpen && autoRefresh) {
      const interval = setInterval(fetchMetrics, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, autoRefresh, fetchMetrics]);

  if (!isOpen) return null;

  const vramPercent = metrics?.gpu.vram_total_gb ? (metrics.gpu.vram_used_gb / metrics.gpu.vram_total_gb) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', backgroundColor: 'var(--bg-primary)' }}>
      <div className="chat-header">
        <div className="chat-header-bar centered">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="header-icon-button" onClick={onClose} title="Back">
              <ArrowLeft size={18} />
            </button>
            <h1 className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} />
              System Metrics
            </h1>
          </div>
          <div className="header-actions">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-refresh
            </label>
            <button className="header-button" onClick={fetchMetrics}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {!metrics ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <Activity size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <p>Loading metrics...</p>
            </div>
          ) : (
            <>
              {/* Inference Device Banner */}
              <MetricCard
                title="Inference Configuration"
                icon={<Zap size={18} style={{ color: '#f59e0b' }} />}
                badge={metrics.inference.device}
                badgeColor={metrics.inference.device === 'GPU' ? '#10b981' : metrics.inference.device === 'CPU+GPU' ? '#6366F1' : '#64748B'}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  {metrics.inference.device === 'GPU' && (
                    <span>Model layers fully offloaded to GPU ({metrics.inference.gpu_layers} layers). Maximum performance.</span>
                  )}
                  {metrics.inference.device === 'CPU+GPU' && (
                    <span>Hybrid mode: {metrics.inference.gpu_layers} layers on GPU, remaining on CPU. Balanced performance.</span>
                  )}
                  {metrics.inference.device === 'CPU' && !metrics.gpu.available && (
                    <span>No GPU detected. Running inference on CPU only. Consider using Online mode (OpenRouter) for faster responses.</span>
                  )}
                  {metrics.inference.device === 'CPU' && metrics.gpu.available && (
                    <span>GPU available but not utilized for inference. GPU layers set to 0.</span>
                  )}
                </div>
              </MetricCard>

              {/* CPU */}
              <MetricCard title="CPU" icon={<Cpu size={18} style={{ color: 'var(--accent)' }} />}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  {metrics.cpu.model_name}{metrics.cpu.frequency_mhz > 0 ? ` @ ${(metrics.cpu.frequency_mhz / 1000).toFixed(1)} GHz` : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>{metrics.cpu.cores} cores</span>
                  <span style={{ fontWeight: 600, color: metrics.cpu.usage_percent > 80 ? '#ef4444' : 'var(--text-primary)' }}>
                    {metrics.cpu.usage_percent.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar percent={metrics.cpu.usage_percent} />
                {/* Per-core usage */}
                {metrics.cpu.per_core_usage.length > 0 && metrics.cpu.per_core_usage.length <= 32 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Per-core usage</div>
                    <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                      {metrics.cpu.per_core_usage.map((usage, i) => (
                        <div key={i} title={`Core ${i}: ${usage.toFixed(1)}%`} style={{
                          width: metrics.cpu.per_core_usage.length > 16 ? '8px' : '14px',
                          height: '20px',
                          borderRadius: '2px',
                          backgroundColor: usage > 80 ? '#ef4444' : usage > 50 ? '#f59e0b' : usage > 10 ? 'var(--accent)' : 'var(--bg-tertiary)',
                          opacity: Math.max(0.3, usage / 100),
                          transition: 'all 0.3s',
                        }} />
                      ))}
                    </div>
                  </div>
                )}
              </MetricCard>

              {/* GPU */}
              <MetricCard title="GPU" icon={<Cpu size={18} style={{ color: '#10b981' }} />}>
                {metrics.gpu.available ? (
                  <>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{metrics.gpu.name}</div>
                    {/* GPU Utilization */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      <span>Utilization</span>
                      <span style={{ fontWeight: 600, color: metrics.gpu.usage_percent > 80 ? '#ef4444' : 'var(--text-primary)' }}>
                        {metrics.gpu.usage_percent.toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar percent={metrics.gpu.usage_percent} color="#10b981" />
                    {/* VRAM */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', marginTop: '10px' }}>
                      <span>VRAM: {metrics.gpu.vram_used_gb.toFixed(1)} / {metrics.gpu.vram_total_gb.toFixed(1)} GB</span>
                      <span>{vramPercent.toFixed(1)}%</span>
                    </div>
                    <ProgressBar percent={vramPercent} color="#059669" />
                    {metrics.gpu.temperature_c > 0 && (
                      <div style={{ fontSize: '12px', color: metrics.gpu.temperature_c > 85 ? '#ef4444' : 'var(--text-muted)', marginTop: '6px' }}>
                        Temperature: {metrics.gpu.temperature_c.toFixed(0)}°C
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      No GPU detected on this system.
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                      All inference runs on CPU. For faster responses without local compute, switch to Online mode and use cloud models via OpenRouter API.
                    </div>
                  </div>
                )}
              </MetricCard>

              {/* Memory */}
              <MetricCard title="Memory (RAM)" icon={<Database size={18} style={{ color: '#f59e0b' }} />}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>{metrics.memory.used_gb.toFixed(1)} / {metrics.memory.total_gb.toFixed(1)} GB</span>
                  <span style={{ fontWeight: 600, color: metrics.memory.usage_percent > 90 ? '#ef4444' : 'var(--text-primary)' }}>
                    {metrics.memory.usage_percent.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar percent={metrics.memory.usage_percent} color="#f59e0b" />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {metrics.memory.available_gb.toFixed(1)} GB available
                </div>
              </MetricCard>

              {/* Storage */}
              <MetricCard title="Storage" icon={<HardDrive size={18} style={{ color: '#8b5cf6' }} />}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>{metrics.storage.used_gb.toFixed(1)} / {(metrics.storage.total_gb).toFixed(1)} GB</span>
                  <span>{metrics.storage.available_gb.toFixed(1)} GB free</span>
                </div>
                <ProgressBar percent={metrics.storage.total_gb > 0 ? (metrics.storage.used_gb / metrics.storage.total_gb) * 100 : 0} color="#8b5cf6" />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Models: {metrics.storage.models_size_gb.toFixed(2)} GB
                </div>
              </MetricCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;
