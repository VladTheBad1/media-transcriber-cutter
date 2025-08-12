'use client'

import React, { useState, useEffect } from 'react'
import { 
  Download, 
  Settings, 
  Play, 
  FileVideo, 
  FileAudio, 
  FileText,
  Smartphone,
  Monitor,
  Instagram,
  Youtube,
  Twitter,
  Linkedin,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  Zap,
  Square,
  Users
} from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'

// Temporary utility function until types are fixed
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
import { 
  SOCIAL_MEDIA_PRESETS, 
  ExportPreset,
  getExportQueue
} from '@/lib/export'

interface ExportOptions {
  format: 'mp4' | 'webm' | 'mov' | 'mp3' | 'wav' | 'srt' | 'vtt' | 'txt'
  quality: 'low' | 'medium' | 'high' | 'ultra'
  resolution: string
  bitrate: number
  audioBitrate: number
  includeSubtitles: boolean
  subtitleStyle: 'burned' | 'srt' | 'vtt'
  watermark: boolean
  watermarkText?: string
  autoCrop: boolean
  optimizeFileSize: boolean
  audioNormalization: boolean
  noiseReduction: boolean
  colorCorrection: boolean
}

interface ExportJobStatus {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  error?: string
  estimatedTimeRemaining?: number
}

interface ExportSettingsProps {
  mediaFileId?: string
  timelineId?: string
  highlightId?: string
  duration: number
  onExport: (jobId: string) => void
  onPreview?: (previewUrl: string) => void
  currentJobs?: ExportJobStatus[]
  className?: string
}

// Platform preset UI mapping
const PRESET_UI_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  'tiktok-vertical': { icon: <Smartphone className="h-4 w-4" />, color: 'bg-pink-600' },
  'instagram-reels': { icon: <Instagram className="h-4 w-4" />, color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
  'instagram-post': { icon: <Square className="h-4 w-4" />, color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
  'youtube-shorts': { icon: <Youtube className="h-4 w-4" />, color: 'bg-red-600' },
  'youtube-video': { icon: <Youtube className="h-4 w-4" />, color: 'bg-red-600' },
  'twitter': { icon: <Twitter className="h-4 w-4" />, color: 'bg-blue-500' },
  'linkedin': { icon: <Linkedin className="h-4 w-4" />, color: 'bg-blue-700' }
}

// Export presets data
const EXPORT_PRESETS: any[] = [ // TODO: Fix ExportPreset type compatibility
  {
    id: 'tiktok-vertical',
    name: 'TikTok Vertical',
    platform: 'TikTok',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    maxDuration: 180, // 3 minutes
    maxFileSize: 100 * 1024 * 1024, // 100MB
    format: 'mp4'
  },
  {
    id: 'instagram-reels',
    name: 'Instagram Reels',
    platform: 'Instagram',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    maxDuration: 90, // 90 seconds
    maxFileSize: 100 * 1024 * 1024, // 100MB
    format: 'mp4'
  },
  {
    id: 'instagram-post',
    name: 'Instagram Post',
    platform: 'Instagram',
    aspectRatio: '1:1',
    resolution: '1080x1080',
    maxDuration: 60, // 60 seconds
    maxFileSize: 100 * 1024 * 1024, // 100MB
    format: 'mp4'
  },
  {
    id: 'youtube-shorts',
    name: 'YouTube Shorts',
    platform: 'YouTube',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    maxDuration: 60, // 60 seconds
    maxFileSize: 512 * 1024 * 1024, // 512MB
    format: 'mp4'
  },
  {
    id: 'youtube-video',
    name: 'YouTube Video',
    platform: 'YouTube',
    aspectRatio: '16:9',
    resolution: '1920x1080',
    maxDuration: 43200, // 12 hours
    maxFileSize: 256 * 1024 * 1024 * 1024, // 256GB
    format: 'mp4'
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    platform: 'Twitter',
    aspectRatio: '16:9',
    resolution: '1280x720',
    maxDuration: 140, // 2:20
    maxFileSize: 512 * 1024 * 1024, // 512MB
    format: 'mp4'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    platform: 'LinkedIn',
    aspectRatio: '16:9',
    resolution: '1920x1080',
    maxDuration: 600, // 10 minutes
    maxFileSize: 200 * 1024 * 1024, // 200MB
    format: 'mp4'
  }
]

const QUALITY_PRESETS = {
  low: { bitrate: 1000, audioBitrate: 128, label: 'Low (Fast)' },
  medium: { bitrate: 2500, audioBitrate: 192, label: 'Medium' },
  high: { bitrate: 5000, audioBitrate: 256, label: 'High' },
  ultra: { bitrate: 10000, audioBitrate: 320, label: 'Ultra (Slow)' }
}

export const ExportSettings: React.FC<ExportSettingsProps> = ({
  duration,
  onExport,
  className
}) => {
  const [selectedPreset, setSelectedPreset] = useState<any>(null) // TODO: Fix ExportPreset type
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  
  const [exportOptions, setExportOptions] = useState<any>({ // TODO: Fix ExportOptions type
    format: 'mp4',
    quality: 'high',
    resolution: '1920x1080',
    bitrate: QUALITY_PRESETS.high.bitrate,
    audioBitrate: QUALITY_PRESETS.high.audioBitrate,
    includeSubtitles: true,
    watermark: false,
    autoCrop: false,
    optimizeFileSize: true
  })

  // Update export options when preset changes
  useEffect(() => {
    if (selectedPreset) {
      setExportOptions(prev => ({
        ...prev,
        format: selectedPreset.format,
        resolution: selectedPreset.resolution,
        // Adjust quality if file size constraints exist
        quality: selectedPreset.maxFileSize < 100 * 1024 * 1024 ? 'medium' : 'high'
      }))
    }
  }, [selectedPreset])

  // Update bitrates when quality changes
  useEffect(() => {
    const qualityPreset = QUALITY_PRESETS[exportOptions.quality]
    setExportOptions(prev => ({
      ...prev,
      bitrate: qualityPreset.bitrate,
      audioBitrate: qualityPreset.audioBitrate
    }))
  }, [exportOptions.quality])

  const estimateFileSize = () => {
    // Rough estimation: (video bitrate + audio bitrate) * duration / 8
    const totalBitrate = exportOptions.bitrate + exportOptions.audioBitrate
    const estimatedBytes = (totalBitrate * 1000 * duration) / 8
    return estimatedBytes
  }

  const estimateExportTime = () => {
    // Rough estimation based on quality and duration
    const multiplier = {
      low: 0.5,
      medium: 1,
      high: 2,
      ultra: 4
    }[exportOptions.quality]
    
    return duration * multiplier
  }

  const getPresetValidation = (preset: ExportPreset) => {
    const warnings = []
    
    if (preset['maxDuration'] && duration > preset['maxDuration']) {
      warnings.push(`Duration exceeds ${formatTime(preset['maxDuration'])} limit`)
    }
    
    const estimatedSize = estimateFileSize()
    if (preset['maxFileSize'] && estimatedSize > preset['maxFileSize']) {
      warnings.push(`Estimated file size exceeds ${formatFileSize(preset['maxFileSize'])} limit`)
    }
    
    return warnings
  }

  const handlePresetSelect = (preset: ExportPreset) => {
    setSelectedPreset(preset)
    setShowAdvanced(false) // Reset to show preset options
  }

  const handleCustomExport = () => {
    setSelectedPreset(null)
    setShowAdvanced(true)
  }

  const handleExport = () => {
    onExport(selectedPreset?.id || 'default')
  }

  const handlePreview = () => {
    setShowPreview(true)
    // Preview functionality would be implemented here
  }

  return (
    <div className={cn("bg-gray-900 rounded-lg border border-gray-700", className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export Center
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Duration: {formatTime(duration)} | Estimated size: {formatFileSize(estimateFileSize())}
        </p>
      </div>

      {isExporting ? (
        /* Export Progress */
        <div className="p-6 text-center">
          <div className="mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          </div>
          <h4 className="text-lg font-medium text-gray-200 mb-2">Exporting...</h4>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-400">
            {Math.round(exportProgress)}% complete
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {/* Platform Presets */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-3">Platform Presets</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {EXPORT_PRESETS.map((preset) => {
                const warnings = getPresetValidation(preset)
                const isSelected = selectedPreset?.id === preset.id
                
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
                      <div className={cn("p-1 rounded text-white", preset.color)}>
                        {preset.icon}
                      </div>
                      <span className="font-medium text-gray-200 text-sm">
                        {preset.name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <div>{preset.aspectRatio}</div>
                      <div>{formatTime(preset.maxDuration)} max</div>
                      {warnings.length > 0 && (
                        <div className="text-yellow-400">⚠️ {warnings.length} warning(s)</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Export Option */}
          <div>
            <button
              onClick={handleCustomExport}
              className={cn(
                "w-full p-3 rounded-lg border-2 text-left transition-all hover:border-blue-400",
                !selectedPreset && showAdvanced ? "border-blue-500 bg-blue-900/30" : "border-gray-600 bg-gray-800"
              )}
            >
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-200">Custom Settings</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Configure your own export settings
              </p>
            </button>
          </div>

          {/* Export Options */}
          {(selectedPreset || showAdvanced) && (
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

              {/* Basic Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Format</label>
                  <select
                    value={exportOptions.format}
                    onChange={(e) => setExportOptions(prev => ({ ...prev, format: e.target.value as any }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 p-2"
                    disabled={!!selectedPreset}
                  >
                    <option value="mp4">MP4</option>
                    <option value="webm">WebM</option>
                    <option value="mov">MOV</option>
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Quality</label>
                  <select
                    value={exportOptions.quality}
                    onChange={(e) => setExportOptions(prev => ({ ...prev, quality: e.target.value as any }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 p-2"
                  >
                    {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Resolution</label>
                  <select
                    value={exportOptions.resolution}
                    onChange={(e) => setExportOptions(prev => ({ ...prev, resolution: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 p-2"
                    disabled={!!selectedPreset}
                  >
                    <option value="3840x2160">4K (3840×2160)</option>
                    <option value="1920x1080">1080p (1920×1080)</option>
                    <option value="1280x720">720p (1280×720)</option>
                    <option value="854x480">480p (854×480)</option>
                  </select>
                </div>
              </div>

              {/* Advanced Settings */}
              {showAdvanced && (
                <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-600">
                  <h5 className="text-sm font-medium text-gray-300">Advanced Options</h5>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Video Bitrate ({exportOptions.bitrate} kbps)
                      </label>
                      <input
                        type="range"
                        min="500"
                        max="15000"
                        value={exportOptions.bitrate}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          bitrate: parseInt(e.target.value) 
                        }))}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Audio Bitrate ({exportOptions.audioBitrate} kbps)
                      </label>
                      <input
                        type="range"
                        min="64"
                        max="320"
                        value={exportOptions.audioBitrate}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          audioBitrate: parseInt(e.target.value) 
                        }))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2">
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
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={exportOptions.optimizeFileSize}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          optimizeFileSize: e.target.checked 
                        }))}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-300">Optimize file size</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Export Summary */}
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-600">
                <h5 className="text-sm font-medium text-gray-300 mb-2">Export Summary</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Estimated size:</span>
                    <span className="text-gray-200 ml-2">{formatFileSize(estimateFileSize())}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Estimated time:</span>
                    <span className="text-gray-200 ml-2">{formatTime(estimateExportTime())}</span>
                  </div>
                </div>
                
                {selectedPreset && getPresetValidation(selectedPreset).length > 0 && (
                  <div className="mt-3 p-2 bg-yellow-900/30 border border-yellow-500 rounded">
                    <div className="text-yellow-400 text-xs font-medium mb-1">Warnings:</div>
                    {getPresetValidation(selectedPreset).map((warning, index) => (
                      <div key={index} className="text-yellow-300 text-xs">• {warning}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handlePreview}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors"
                >
                  <Play className="h-4 w-4" />
                  Preview Export
                </button>
                
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium flex-1 justify-center"
                >
                  <Download className="h-4 w-4" />
                  Start Export
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ExportSettings