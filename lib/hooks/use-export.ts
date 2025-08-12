import { useState, useEffect, useCallback } from 'react';
import { ExportJob, ExportPreset } from '@/lib/export';

export interface ExportJobStatus {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  estimatedTimeRemaining?: number;
  result?: {
    outputPath: string;
    fileSize: number;
    duration: number;
  };
}

export interface ExportQueueStats {
  totalJobs: number;
  queuedJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  estimatedTimeRemaining: number;
}

export interface UseExportOptions {
  pollInterval?: number;
  autoRefresh?: boolean;
}

export function useExport(options: UseExportOptions = {}) {
  const { pollInterval = 2000, autoRefresh = true } = options;
  
  const [currentJobs, setCurrentJobs] = useState<ExportJobStatus[]>([]);
  const [queueStats, setQueueStats] = useState<ExportQueueStats | null>(null);
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available export presets
  const loadPresets = useCallback(async () => {
    try {
      const response = await fetch('/api/export/presets');
      if (response.ok) {
        const data = await response.json();
        setPresets(data.presets);
      }
    } catch (err) {
      console.error('Failed to load export presets:', err);
    }
  }, []);

  // Load current export jobs and queue stats
  const loadExportData = useCallback(async () => {
    try {
      const response = await fetch('/api/export/queue');
      if (response.ok) {
        const data = await response.json();
        setCurrentJobs(data.queue.jobs);
        setQueueStats(data.queue.stats);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load export data');
    }
  }, []);

  // Start a single export job
  const startExport = useCallback(async (params: {
    mediaFileId?: string;
    timelineId?: string;
    highlightId?: string;
    presetId: string;
    outputFilename: string;
    options?: {
      includeSubtitles?: boolean;
      subtitleStyle?: 'burned' | 'srt' | 'vtt';
      watermark?: boolean;
      watermarkText?: string;
      autoCrop?: boolean;
      audioNormalization?: boolean;
      noiseReduction?: boolean;
      colorCorrection?: boolean;
      priority?: number;
    };
  }): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/export/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (response.ok) {
        const data = await response.json();
        await loadExportData(); // Refresh the job list
        return data.jobId;
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Export failed');
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Export request failed';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [loadExportData]);

  // Start a batch export
  const startBatchExport = useCallback(async (params: {
    mediaFileId?: string;
    timelineId?: string;
    baseFilename: string;
    platforms: string[];
    options?: {
      includeSubtitles?: boolean;
      outputDirectory?: string;
      priority?: number;
    };
  }): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/export/start', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (response.ok) {
        const data = await response.json();
        await loadExportData();
        return data.batchId;
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Batch export failed');
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Batch export request failed';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [loadExportData]);

  // Generate export preview
  const generatePreview = useCallback(async (params: {
    mediaFileId?: string;
    timelineId?: string;
    highlightId?: string;
    presetId: string;
    previewDuration?: number;
    startTime?: number;
  }): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/export/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (response.ok) {
        const data = await response.json();
        return data.preview.url;
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Preview generation failed');
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Preview request failed';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cancel an export job
  const cancelJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/export/status/${jobId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadExportData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to cancel job:', err);
      return false;
    }
  }, [loadExportData]);

  // Retry a failed export job
  const retryJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/export/status/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' })
      });

      if (response.ok) {
        await loadExportData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to retry job:', err);
      return false;
    }
  }, [loadExportData]);

  // Get specific job status
  const getJobStatus = useCallback(async (jobId: string): Promise<ExportJobStatus | null> => {
    try {
      const response = await fetch(`/api/export/status/${jobId}`);
      if (response.ok) {
        const data = await response.json();
        return data.job;
      }
      return null;
    } catch (err) {
      console.error('Failed to get job status:', err);
      return null;
    }
  }, []);

  // Validate export preset
  const validatePreset = useCallback(async (
    presetId: string,
    duration: number,
    estimatedFileSize?: number
  ): Promise<{
    valid: boolean;
    warnings: string[];
    errors: string[];
    estimates?: {
      processingTime: number;
      fileSize: number;
    };
  } | null> => {
    try {
      const response = await fetch('/api/export/presets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId,
          duration,
          estimatedFileSize
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.validation;
      }
      return null;
    } catch (err) {
      console.error('Failed to validate preset:', err);
      return null;
    }
  }, []);

  // Queue management functions
  const pauseQueue = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/export/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' })
      });
      
      if (response.ok) {
        await loadExportData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to pause queue:', err);
      return false;
    }
  }, [loadExportData]);

  const resumeQueue = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/export/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' })
      });
      
      if (response.ok) {
        await loadExportData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to resume queue:', err);
      return false;
    }
  }, [loadExportData]);

  const clearQueue = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/export/queue', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadExportData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to clear queue:', err);
      return false;
    }
  }, [loadExportData]);

  // Auto-refresh effect
  useEffect(() => {
    // Initial load
    loadPresets();
    loadExportData();

    // Set up polling for job updates
    let interval: NodeJS.Timeout | null = null;
    
    if (autoRefresh) {
      interval = setInterval(loadExportData, pollInterval);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [loadPresets, loadExportData, autoRefresh, pollInterval]);

  // Helper functions
  const getActiveJobs = useCallback(() => {
    return currentJobs.filter(job => 
      job.status === 'queued' || job.status === 'processing'
    );
  }, [currentJobs]);

  const getCompletedJobs = useCallback(() => {
    return currentJobs.filter(job => job.status === 'completed');
  }, [currentJobs]);

  const getFailedJobs = useCallback(() => {
    return currentJobs.filter(job => job.status === 'failed');
  }, [currentJobs]);

  const isQueueBusy = useCallback(() => {
    return getActiveJobs().length > 0;
  }, [getActiveJobs]);

  return {
    // State
    currentJobs,
    queueStats,
    presets,
    isLoading,
    error,

    // Actions
    startExport,
    startBatchExport,
    generatePreview,
    cancelJob,
    retryJob,
    getJobStatus,
    validatePreset,
    
    // Queue management
    pauseQueue,
    resumeQueue,
    clearQueue,
    
    // Helpers
    getActiveJobs,
    getCompletedJobs,
    getFailedJobs,
    isQueueBusy,
    
    // Manual refresh
    refresh: loadExportData,
    refreshPresets: loadPresets
  };
}