'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { 
  Download, 
  Settings, 
  Play, 
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Users,
  Square,
  Smartphone,
  Monitor,
  Instagram,
  Youtube,
  Twitter,
  Linkedin,
  Facebook,
  Loader2,
  X,
  RotateCcw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  ExportPreset,
  ExportJob,
  formatFileSize, 
  formatDuration,
  SOCIAL_MEDIA_PRESETS
} from '@/lib/export'

interface ExportSettingsProps {
  mediaFileId?: string
  timelineId?: string
  highlightId?: string
  duration: number
  onExport: (jobId: string) => void
  onPreview?: (previewUrl: string) => void
  onClose?: () => void
  className?: string
}

interface ExportJobStatus {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  error?: string
  estimatedTimeRemaining?: number
  result?: {
    outputPath: string
    fileSize: number
    duration: number
  }
}

interface ExportOptions {
  includeSubtitles: boolean
  subtitleStyle: 'burned' | 'srt' | 'vtt'
  watermark: boolean
  watermarkText: string
  autoCrop: boolean
  audioNormalization: boolean
  noiseReduction: boolean
  colorCorrection: boolean
  priority: number
}

// Platform preset UI mapping
const PRESET_UI_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  'tiktok-vertical': { icon: <Smartphone className="h-4 w-4" />, color: 'bg-pink-600' },
  'instagram-reels': { icon: <Instagram className="h-4 w-4" />, color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
  'instagram-post': { icon: <Square className="h-4 w-4" />, color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
  'youtube-shorts': { icon: <Youtube className="h-4 w-4" />, color: 'bg-red-600' },
  'youtube-standard': { icon: <Monitor className="h-4 w-4" />, color: 'bg-red-600' },
  'twitter-video': { icon: <Twitter className="h-4 w-4" />, color: 'bg-blue-500' },
  'linkedin-video': { icon: <Linkedin className="h-4 w-4" />, color: 'bg-blue-700' },
  'facebook-video': { icon: <Facebook className="h-4 w-4" />, color: 'bg-blue-600' }
}

export const ExportSettingsAdvanced: React.FC<ExportSettingsProps> = ({
  mediaFileId,
  timelineId,
  highlightId,
  duration,
  onExport,
  onPreview,
  onClose,
  className
}) => {
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showBatchMode, setShowBatchMode] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [currentJobs, setCurrentJobs] = useState<ExportJobStatus[]>([])
  const [validation, setValidation] = useState<{
    valid: boolean
    warnings: string[]
    errors: string[]
    estimates?: {
      fileSize: number
      processingTime: number
    }
  } | null>(null)

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeSubtitles: true,
    subtitleStyle: 'burned',
    watermark: false,
    watermarkText: '',
    autoCrop: false,
    audioNormalization: true,
    noiseReduction: false,
    colorCorrection: false,
    priority: 0
  })

  const [batchOptions, setBatchOptions] = useState({
    selectedPlatforms: ['TikTok', 'Instagram', 'YouTube'],
    baseFilename: `export_${Date.now()}`,
    outputDirectory: 'exports'
  })

  // Load current export jobs
  useEffect(() => {
    loadCurrentJobs()
    const interval = setInterval(loadCurrentJobs, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [])

  // Validate preset when selection changes
  useEffect(() => {
    if (selectedPreset) {
      validatePreset(selectedPreset)
    }
  }, [selectedPreset, duration])

  const loadCurrentJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/export/queue')
      if (response.ok) {
        const data = await response.json()
        setCurrentJobs(data.queue.jobs.filter((job: any) => 
          job.status === 'queued' || job.status === 'processing'
        ))
      }
    } catch (error) {
      console.error('Failed to load export jobs:', error)
    }
  }, [])

  const validatePreset = async (preset: ExportPreset) => {
    try {
      const response = await fetch('/api/export/presets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: preset.id,
          duration,
          estimatedFileSize: estimateFileSize(preset)
        })
      })

      if (response.ok) {
        const data = await response.json()
        setValidation(data.validation)
      }
    } catch (error) {
      console.error('Failed to validate preset:', error)
    }
  }

  const estimateFileSize = (preset: ExportPreset): number => {
    if (!preset.video?.bitrate || !preset.audio?.bitrate) return 0
    
    const videoBitrate = parseInt(preset.video.bitrate.replace('k', '')) * 1000
    const audioBitrate = parseInt(preset.audio.bitrate.replace('k', '')) * 1000
    
    return Math.round(((videoBitrate + audioBitrate) * duration / 8) * 1.1)
  }

  const handlePresetSelect = (preset: ExportPreset) => {
    setSelectedPreset(preset)
    setShowAdvanced(false)
    
    // Update export options based on preset capabilities
    setExportOptions(prev => ({
      ...prev,
      autoCrop: preset.processing?.autoCrop || false,
      audioNormalization: preset.processing?.audioNormalization || false,
      noiseReduction: preset.processing?.noiseReduction || false,
      colorCorrection: preset.processing?.colorCorrection || false,
      subtitleStyle: preset.subtitles?.format === 'burned' ? 'burned' : 'srt'
    }))
  }

  const handleExport = async () => {
    if (!selectedPreset) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/export/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFileId,
          timelineId,
          highlightId,
          presetId: selectedPreset.id,
          outputFilename: `export_${selectedPreset.id}_${Date.now()}.${selectedPreset.video?.format || 'mp4'}`,
          options: exportOptions
        })
      })

      if (response.ok) {
        const data = await response.json()
        onExport(data.jobId)
        loadCurrentJobs() // Refresh job list
      } else {
        const error = await response.json()
        console.error('Export failed:', error)
      }
    } catch (error) {
      console.error('Export request failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBatchExport = async () => {
    if (batchOptions.selectedPlatforms.length === 0) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/export/start', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFileId,
          timelineId,
          baseFilename: batchOptions.baseFilename,
          platforms: batchOptions.selectedPlatforms,
          options: {
            ...exportOptions,
            outputDirectory: batchOptions.outputDirectory
          }
        })
      })

      if (response.ok) {
        const data = await response.json()
        onExport(data.batchId)
        loadCurrentJobs()
      } else {
        const error = await response.json()
        console.error('Batch export failed:', error)
      }
    } catch (error) {
      console.error('Batch export request failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreview = async () => {
    if (!selectedPreset) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/export/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFileId,
          timelineId,
          highlightId,
          presetId: selectedPreset.id,
          previewDuration: 10,
          startTime: Math.max(0, duration / 2 - 5) // Start from middle
        })
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewUrl(data.preview.url)
        onPreview?.(data.preview.url)
      } else {
        const error = await response.json()
        console.error('Preview failed:', error)
      }
    } catch (error) {
      console.error('Preview request failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/export/status/${jobId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        loadCurrentJobs()
      }
    } catch (error) {
      console.error('Failed to cancel job:', error)
    }
  }

  const retryJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/export/status/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' })
      })
      if (response.ok) {
        loadCurrentJobs()
      }
    } catch (error) {
      console.error('Failed to retry job:', error)
    }
  }

  const getPresetIcon = (preset: ExportPreset) => {
    const uiMap = PRESET_UI_MAP[preset.id]
    return uiMap ? uiMap.icon : <Monitor className="h-4 w-4" />
  }

  const getPresetColor = (preset: ExportPreset) => {
    const uiMap = PRESET_UI_MAP[preset.id]
    return uiMap ? uiMap.color : 'bg-gray-600'
  }

  return (
    <div className={cn("bg-gray-900 rounded-lg border border-gray-700 max-w-6xl", className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Center
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Duration: {formatDuration(duration)}
            {validation?.estimates && (
              <>
                {' '}| Est. size: {formatFileSize(validation.estimates.fileSize)}
                {' '}| Est. time: {formatDuration(validation.estimates.processingTime)}
              </>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBatchMode(!showBatchMode)}
            className={cn(
              "px-3 py-1 text-sm rounded-md transition-colors",
              showBatchMode ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            )}
          >
            <Users className="h-4 w-4 inline mr-1" />
            Batch Mode
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-md transition-colors"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Current Jobs Status */}
        {currentJobs.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Active Exports ({currentJobs.length})
            </h4>
            <div className="space-y-2">
              {currentJobs.map(job => (
                <div key={job.id} className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {job.status === 'processing' ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      ) : job.status === 'queued' ? (
                        <Clock className="h-4 w-4 text-yellow-500" />
                      ) : job.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm font-medium text-gray-200">
                        Job {job.id.slice(-8)}
                      </span>
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full",
                        job.status === 'processing' ? 'bg-blue-600 text-white' :
                        job.status === 'queued' ? 'bg-yellow-600 text-white' :
                        job.status === 'completed' ? 'bg-green-600 text-white' :
                        'bg-red-600 text-white'
                      )}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {job.status === 'failed' && (
                        <button
                          onClick={() => retryJob(job.id)}
                          className="p-1 hover:bg-gray-700 rounded transition-colors"
                          title="Retry job"
                        >
                          <RotateCcw className="h-3 w-3 text-gray-400" />
                        </button>
                      )}
                      {(job.status === 'queued' || job.status === 'processing') && (
                        <button
                          onClick={() => cancelJob(job.id)}
                          className="p-1 hover:bg-gray-700 rounded transition-colors"
                          title="Cancel job"
                        >
                          <X className="h-3 w-3 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {job.status === 'processing' && (
                    <div className="space-y-1">
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{Math.round(job.progress)}% complete</span>
                        {job.estimatedTimeRemaining && (
                          <span>{formatDuration(job.estimatedTimeRemaining)} remaining</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {job.error && (
                    <p className="text-xs text-red-400 mt-1">{job.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {showBatchMode ? (
          /* Batch Export Mode */
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-300">Multi-Platform Export</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-2">Base Filename</label>
                <input
                  type="text"
                  value={batchOptions.baseFilename}
                  onChange={(e) => setBatchOptions(prev => ({ 
                    ...prev, 
                    baseFilename: e.target.value 
                  }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 p-2"
                  placeholder="Enter base filename"
                />
              </div>
              
              <div>
                <label className="block text-xs text-gray-400 mb-2">Output Directory</label>
                <input
                  type="text"
                  value={batchOptions.outputDirectory}
                  onChange={(e) => setBatchOptions(prev => ({ 
                    ...prev, 
                    outputDirectory: e.target.value 
                  }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 p-2"
                  placeholder="exports"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs text-gray-400 mb-2">Select Platforms</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {['TikTok', 'Instagram', 'YouTube', 'Twitter', 'LinkedIn', 'Facebook'].map(platform => (
                  <label key={platform} className="flex items-center gap-2 p-2 bg-gray-800 rounded border border-gray-600 cursor-pointer hover:bg-gray-700">
                    <input
                      type="checkbox"
                      checked={batchOptions.selectedPlatforms.includes(platform)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchOptions(prev => ({
                            ...prev,
                            selectedPlatforms: [...prev.selectedPlatforms, platform]
                          }))
                        } else {
                          setBatchOptions(prev => ({
                            ...prev,
                            selectedPlatforms: prev.selectedPlatforms.filter(p => p !== platform)
                          }))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-200">{platform}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <button
              onClick={handleBatchExport}
              disabled={isLoading || batchOptions.selectedPlatforms.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Start Batch Export ({batchOptions.selectedPlatforms.length} platforms)
            </button>
          </div>
        ) : (
          /* Single Export Mode */
          <div className="space-y-6">
            {/* Platform Presets */}
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-3">Platform Presets</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SOCIAL_MEDIA_PRESETS.slice(0, 8).map((preset) => {
                  const isSelected = selectedPreset?.id === preset.id
                  const warnings = validation?.warnings.length || 0
                  const errors = validation?.errors.length || 0
                  
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        "p-3 rounded-lg border-2 text-left transition-all hover:border-blue-400",
                        isSelected ? "border-blue-500 bg-blue-900/30" : "border-gray-600 bg-gray-800"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn("p-1 rounded text-white", getPresetColor(preset))}>
                          {getPresetIcon(preset)}
                        </div>
                        <span className="font-medium text-gray-200 text-sm">
                          {preset.name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>{preset.video?.aspectRatio}</div>
                        <div>{preset.video?.resolution.width}×{preset.video?.resolution.height}</div>
                        {preset.constraints?.maxDuration && (
                          <div>{formatDuration(preset.constraints.maxDuration)} max</div>
                        )}
                        {isSelected && (warnings > 0 || errors > 0) && (
                          <div className={cn(
                            "flex items-center gap-1",
                            errors > 0 ? "text-red-400" : "text-yellow-400"
                          )}>
                            <AlertCircle className="h-3 w-3" />
                            {errors > 0 ? `${errors} error(s)` : `${warnings} warning(s)`}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Export Options */}
            {selectedPreset && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-300">Export Settings</h4>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {showAdvanced ? 'Hide' : 'Show'} Advanced
                  </button>
                </div>

                {/* Basic Options */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeSubtitles}
                      onChange={(e) => setExportOptions(prev => ({ 
                        ...prev, 
                        includeSubtitles: e.target.checked 
                      }))}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-300">Include subtitles</span>
                  </label>

                  {exportOptions.includeSubtitles && (
                    <div className="ml-6">
                      <label className="block text-xs text-gray-400 mb-1">Subtitle Format</label>
                      <select
                        value={exportOptions.subtitleStyle}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          subtitleStyle: e.target.value as 'burned' | 'srt' | 'vtt'
                        }))}
                        className="bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 p-2"
                      >
                        <option value="burned">Burned-in (hardcoded)</option>
                        <option value="srt">SRT (separate file)</option>
                        <option value="vtt">VTT (web captions)</option>
                      </select>
                    </div>
                  )}

                  {selectedPreset.processing?.autoCrop && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={exportOptions.autoCrop}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          autoCrop: e.target.checked 
                        }))}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-300">Auto-crop subjects</span>
                      {exportOptions.autoCrop && (
                        <span className="text-xs text-blue-400">(AI-powered)</span>
                      )}
                    </label>
                  )}

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exportOptions.watermark}
                      onChange={(e) => setExportOptions(prev => ({ 
                        ...prev, 
                        watermark: e.target.checked 
                      }))}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-300">Add watermark</span>
                  </label>

                  {exportOptions.watermark && (
                    <div className="ml-6">
                      <input
                        type="text"
                        value={exportOptions.watermarkText}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          watermarkText: e.target.value 
                        }))}
                        placeholder="Enter watermark text"
                        className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 p-2"
                      />
                    </div>
                  )}
                </div>

                {/* Advanced Options */}
                {showAdvanced && (
                  <div className="space-y-3 p-4 bg-gray-800 rounded-lg border border-gray-600">
                    <h5 className="text-sm font-medium text-gray-300">Processing Options</h5>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={exportOptions.audioNormalization}
                          onChange={(e) => setExportOptions(prev => ({ 
                            ...prev, 
                            audioNormalization: e.target.checked 
                          }))}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-300">Audio normalization</span>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={exportOptions.noiseReduction}
                          onChange={(e) => setExportOptions(prev => ({ 
                            ...prev, 
                            noiseReduction: e.target.checked 
                          }))}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-300">Noise reduction</span>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={exportOptions.colorCorrection}
                          onChange={(e) => setExportOptions(prev => ({ 
                            ...prev, 
                            colorCorrection: e.target.checked 
                          }))}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-300">Color correction</span>
                      </label>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Priority (0-10)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={exportOptions.priority}
                          onChange={(e) => setExportOptions(prev => ({ 
                            ...prev, 
                            priority: parseInt(e.target.value) 
                          }))}
                          className="w-full"
                        />
                        <div className="text-xs text-gray-400 mt-1">
                          {exportOptions.priority === 0 ? 'Normal' : 
                           exportOptions.priority > 7 ? 'High' : 'Medium'} priority
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Results */}
                {validation && (
                  <div className="p-3 rounded-lg border" style={{
                    backgroundColor: validation.errors.length > 0 ? 'rgb(127 29 29 / 0.3)' : 
                                     validation.warnings.length > 0 ? 'rgb(120 53 15 / 0.3)' : 
                                     'rgb(21 128 61 / 0.3)',
                    borderColor: validation.errors.length > 0 ? 'rgb(248 113 113)' : 
                                 validation.warnings.length > 0 ? 'rgb(251 191 36)' : 
                                 'rgb(34 197 94)'
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {validation.errors.length > 0 ? (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      ) : validation.warnings.length > 0 ? (
                        <AlertCircle className="h-4 w-4 text-yellow-400" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      )}
                      <span className="text-sm font-medium text-gray-200">
                        {validation.errors.length > 0 ? 'Validation Errors' :
                         validation.warnings.length > 0 ? 'Validation Warnings' :
                         'Validation Passed'}
                      </span>
                    </div>
                    
                    {validation.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-300">• {error}</div>
                    ))}
                    
                    {validation.warnings.map((warning, index) => (
                      <div key={index} className="text-sm text-yellow-300">• {warning}</div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handlePreview}
                    disabled={isLoading || !validation?.valid}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-200 rounded-md transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Preview
                  </button>
                  
                  <button
                    onClick={handleExport}
                    disabled={isLoading || !validation?.valid}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium flex-1 justify-center"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Start Export
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ExportSettingsAdvanced