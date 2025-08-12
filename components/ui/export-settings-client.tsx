"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatTime, formatFileSize } from '@/lib/utils'
import {
  Download,
  Settings,
  Smartphone,
  Square,
  Youtube,
  Twitter,
  Linkedin,
  Instagram,
  AlertTriangle,
  Clock,
  HardDrive
} from 'lucide-react'

export interface ExportPreset {
  id: string
  name: string
  platform: string
  aspectRatio: string
  resolution: string
  maxDuration: number
  maxFileSize: number
  format: string
}

interface ExportSettingsProps {
  mediaFileId?: string
  timelineId?: string
  mediaFile?: any
  transcript?: any
  duration: number
  onExport?: (settings: any) => Promise<void>
  onPreview?: (settings: any) => Promise<void>
  isExporting?: boolean
  exportProgress?: number
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
const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'tiktok-vertical',
    name: 'TikTok Vertical',
    platform: 'TikTok',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    maxDuration: 180,
    maxFileSize: 100 * 1024 * 1024,
    format: 'mp4'
  },
  {
    id: 'instagram-reels',
    name: 'Instagram Reels',
    platform: 'Instagram',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    maxDuration: 90,
    maxFileSize: 100 * 1024 * 1024,
    format: 'mp4'
  },
  {
    id: 'instagram-post',
    name: 'Instagram Post',
    platform: 'Instagram',
    aspectRatio: '1:1',
    resolution: '1080x1080',
    maxDuration: 60,
    maxFileSize: 100 * 1024 * 1024,
    format: 'mp4'
  },
  {
    id: 'youtube-shorts',
    name: 'YouTube Shorts',
    platform: 'YouTube',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    maxDuration: 60,
    maxFileSize: 512 * 1024 * 1024,
    format: 'mp4'
  },
  {
    id: 'youtube-video',
    name: 'YouTube Video',
    platform: 'YouTube',
    aspectRatio: '16:9',
    resolution: '1920x1080',
    maxDuration: 43200,
    maxFileSize: 256 * 1024 * 1024 * 1024,
    format: 'mp4'
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    platform: 'Twitter',
    aspectRatio: '16:9',
    resolution: '1280x720',
    maxDuration: 140,
    maxFileSize: 512 * 1024 * 1024,
    format: 'mp4'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    platform: 'LinkedIn',
    aspectRatio: '16:9',
    resolution: '1920x1080',
    maxDuration: 600,
    maxFileSize: 200 * 1024 * 1024,
    format: 'mp4'
  }
]

export const ExportSettings: React.FC<ExportSettingsProps> = ({
  mediaFileId,
  timelineId,
  duration,
  onExport,
  onPreview,
  isExporting = false,
  exportProgress = 0,
  className
}) => {
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)

  const getPresetValidation = (preset: ExportPreset) => {
    const warnings = []
    
    if (duration > preset.maxDuration) {
      warnings.push(`Duration exceeds ${formatTime(preset.maxDuration)} limit`)
    }
    
    return warnings
  }

  const handlePresetSelect = (preset: ExportPreset) => {
    setSelectedPreset(preset)
    setShowAdvanced(false)
  }

  const handleExport = async () => {
    if (selectedPreset && onExport) {
      try {
        await onExport({
          mediaFileId,
          timelineId,
          presetId: selectedPreset.id,
          outputFilename: `export_${selectedPreset.id}_${Date.now()}.${selectedPreset.format}`,
          options: {
            includeSubtitles: true,
            audioNormalization: true,
            outputDirectory: 'exports'
          }
        })
      } catch (error) {
        console.error('Export failed:', error)
      }
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Export Progress */}
      {isExporting && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Exporting...</span>
              <span className="text-sm text-gray-500">{Math.round(exportProgress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Presets</CardTitle>
          <CardDescription>
            Choose a platform-optimized export preset
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {EXPORT_PRESETS.map((preset) => {
              const warnings = getPresetValidation(preset)
              const isSelected = selectedPreset?.id === preset.id
              const uiConfig = PRESET_UI_MAP[preset.id]
              
              return (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className={cn(
                    "p-4 rounded-lg border-2 transition-all duration-200 text-left",
                    isSelected 
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600",
                    warnings.length > 0 && "border-amber-300 bg-amber-50 dark:bg-amber-900/20"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className={cn("p-2 rounded-lg text-white", uiConfig?.color || 'bg-gray-500')}>
                      {uiConfig?.icon || <Settings className="h-4 w-4" />}
                    </div>
                    {warnings.length > 0 && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{preset.name}</h4>
                    <p className="text-xs text-gray-500 mb-1">{preset.resolution}</p>
                    <p className="text-xs text-gray-500">{preset.aspectRatio}</p>
                  </div>
                  {warnings.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      {warnings.map((warning, index) => (
                        <p key={index} className="text-xs text-amber-600 dark:text-amber-400">
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Preset Details */}
      {selectedPreset && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {PRESET_UI_MAP[selectedPreset.id]?.icon}
              {selectedPreset.name} Settings
            </CardTitle>
            <CardDescription>
              Export settings for {selectedPreset.platform}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Resolution:</span>
                <p className="font-medium">{selectedPreset.resolution}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Aspect Ratio:</span>
                <p className="font-medium">{selectedPreset.aspectRatio}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Max Duration:</span>
                <p className="font-medium">{formatTime(selectedPreset.maxDuration)}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Max File Size:</span>
                <p className="font-medium">{formatFileSize(selectedPreset.maxFileSize)}</p>
              </div>
            </div>

            {/* Export Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button 
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                {isExporting ? 'Exporting...' : 'Export Video'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAdvanced(!showAdvanced)}
                disabled={isExporting}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Duration: {formatTime(duration)}
            </div>
            {selectedPreset && (
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Target: {selectedPreset.platform}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}