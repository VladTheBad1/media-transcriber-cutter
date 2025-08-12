"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { TimelineEditor } from "./timeline-editor";
import { MediaPlayer, type MediaPlayerRef } from "./media-player";
import {
  TimelineOperations,
  createTimelineOperations,
  type TimelineClip,
} from "@/lib/timeline/operations";
import { formatTime } from "@/lib/utils";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Button } from "./button";
import { Alert, AlertDescription } from "./alert";

interface MediaFile {
  id: string;
  name: string;
  type: "video" | "audio";
  duration: number;
  size: number;
  createdAt: Date;
  status: string;
}

interface Transcript {
  id: string;
  mediaFileId: string;
  language: string;
  confidence: number;
  status: string;
  segments: TranscriptSegment[];
}

interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker?: {
    id: string;
    label: string;
    name?: string;
  };
}

interface TimelineWrapperProps {
  mediaFile: MediaFile;
  transcript?: Transcript | null;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSave?: (success: boolean) => void;
  className?: string;
}

export const TimelineWrapper: React.FC<TimelineWrapperProps> = ({
  mediaFile,
  transcript,
  currentTime,
  onTimeUpdate,
  onSave,
  className,
}) => {
  const [operations, setOperations] = useState<TimelineOperations | null>(null);
  const [timelineState, setTimelineState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [activeClips, setActiveClips] = useState<TimelineClip[]>([]);
  const [virtualTimeline, setVirtualTimeline] = useState<{ virtual: number; actual: number }[]>([]);
  const [virtualDuration, setVirtualDuration] = useState(0);

  const lastSaveTimeRef = useRef<number>(0);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const mediaPlayerRef = useRef<MediaPlayerRef>(null);
  const playbackMonitorRef = useRef<NodeJS.Timeout>();
  const lastActualTimeRef = useRef<number>(0);

  // Generate media URL for player
  const getMediaUrl = (media: MediaFile) => {
    // Use the actual filename (UUID) that exists on disk
    const filename = (media as any).filename || media.name;
    return `/api/media/stream/${filename}`;
  };

  // Get active clips from all visible tracks
  const getActiveClips = useCallback((state: any) => {
    if (!state?.tracks) return [];
    
    const clips: TimelineClip[] = [];
    state.tracks.forEach((track: any) => {
      if (track.visible && !track.muted) {
        clips.push(...track.clips);
      }
    });
    
    // Sort clips by start time
    return clips.sort((a, b) => a.start - b.start);
  }, []);

  // Build virtual timeline mapping (virtual time -> actual media time)
  const buildVirtualTimeline = useCallback((clips: TimelineClip[]) => {
    const mapping: { virtual: number; actual: number }[] = [];
    let virtualTime = 0;
    
    // Create mapping for each clip
    clips.forEach(clip => {
      const clipDuration = clip.end - clip.start;
      
      // Add start point
      mapping.push({ virtual: virtualTime, actual: clip.start });
      
      // Add end point
      virtualTime += clipDuration;
      mapping.push({ virtual: virtualTime, actual: clip.end });
    });
    
    return { mapping, totalDuration: virtualTime };
  }, []);

  // Convert virtual time to actual media time
  const virtualToActualTime = useCallback((virtualTime: number | undefined | null, mapping: { virtual: number; actual: number }[]) => {
    // Handle undefined or invalid virtualTime
    if (virtualTime === undefined || virtualTime === null || isNaN(virtualTime)) {
      return 0;
    }
    
    if (!mapping || mapping.length === 0) return virtualTime;
    
    // Find the segment this virtual time belongs to
    for (let i = 0; i < mapping.length - 1; i += 2) {
      const segmentStart = mapping[i];
      const segmentEnd = mapping[i + 1];
      
      if (segmentStart && segmentEnd && 
          virtualTime >= segmentStart.virtual && virtualTime <= segmentEnd.virtual) {
        // Calculate position within this segment
        const segmentProgress = (virtualTime - segmentStart.virtual) / (segmentEnd.virtual - segmentStart.virtual);
        const actualTime = segmentStart.actual + segmentProgress * (segmentEnd.actual - segmentStart.actual);
        return actualTime;
      }
    }
    
    // If beyond all clips, return the last actual time
    return mapping.length > 0 ? mapping[mapping.length - 1].actual : virtualTime;
  }, []);

  // Convert actual media time to virtual time
  const actualToVirtualTime = useCallback((actualTime: number, mapping: { virtual: number; actual: number }[], clips: TimelineClip[]) => {
    // Handle undefined or invalid actualTime
    if (actualTime === undefined || actualTime === null || isNaN(actualTime)) {
      return 0;
    }
    
    if (!mapping || mapping.length === 0) return actualTime;
    
    // Check if actual time is within any clip
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (actualTime >= clip.start && actualTime <= clip.end) {
        // Find corresponding virtual segment
        const segmentIndex = i * 2;
        const segmentStart = mapping[segmentIndex];
        const segmentEnd = mapping[segmentIndex + 1];
        
        // Calculate virtual time within this segment
        const clipProgress = (actualTime - clip.start) / (clip.end - clip.start);
        const virtualTime = segmentStart.virtual + clipProgress * (segmentEnd.virtual - segmentStart.virtual);
        return virtualTime;
      }
    }
    
    // If not in any clip, return 0 or nearest clip start
    return 0;
  }, []);

  // Check if actual time is in a cut section and get next valid clip start
  const getNextValidTime = useCallback((actualTime: number, clips: TimelineClip[]) => {
    if (clips.length === 0) return actualTime;
    
    // Sort clips by start time
    const sortedClips = [...clips].sort((a, b) => a.start - b.start);
    
    // Check if we're in a valid clip
    for (const clip of sortedClips) {
      if (actualTime >= clip.start && actualTime <= clip.end) {
        return actualTime; // We're in a valid clip
      }
    }
    
    // We're in a cut section, find the next clip
    for (const clip of sortedClips) {
      if (clip.start > actualTime) {
        return clip.start; // Jump to the start of the next clip
      }
    }
    
    // No more clips, pause at the end
    return -1;
  }, []);

  // Initialize timeline operations
  useEffect(() => {
    const initializeTimeline = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const timelineOps = createTimelineOperations();
        await timelineOps.initializeFromMedia(mediaFile.id, transcript);

        // Subscribe to state changes
        const unsubscribe = timelineOps.subscribe((state) => {
          setTimelineState(state);
          setHasUnsavedChanges(true);
          
          // Update active clips and virtual timeline when timeline changes
          const clips = getActiveClips(state);
          setActiveClips(clips);
          
          // Build virtual timeline mapping
          const { mapping, totalDuration } = buildVirtualTimeline(clips);
          setVirtualTimeline(mapping);
          setVirtualDuration(totalDuration);

          // Auto-save after 2 seconds of inactivity
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }

          autoSaveTimeoutRef.current = setTimeout(() => {
            handleAutoSave(timelineOps);
          }, 2000);
        });

        setOperations(timelineOps);
        setTimelineState(timelineOps.getState());
        setIsLoading(false);

        return () => {
          unsubscribe();
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }
        };
      } catch (err) {
        console.error("Failed to initialize timeline:", err);
        setError(
          "Failed to initialize timeline. Please try refreshing the page.",
        );
        setIsLoading(false);
      }
    };

    initializeTimeline();
  }, [mediaFile.id, transcript]);

  // Auto-save handler
  const handleAutoSave = useCallback(async (ops: TimelineOperations) => {
    const now = Date.now();
    if (now - lastSaveTimeRef.current < 1000) return; // Debounce

    lastSaveTimeRef.current = now;

    try {
      await ops.saveTimeline();
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  }, []);

  // Manual save handler
  const handleManualSave = useCallback(async () => {
    if (!operations || isSaving) return;

    setIsSaving(true);
    try {
      await operations.saveTimeline();
      setHasUnsavedChanges(false);
      onSave?.(true);
    } catch (err) {
      console.error("Manual save failed:", err);
      onSave?.(false);
      setError("Failed to save timeline. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [operations, isSaving, onSave]);

  // Timeline editor event handlers
  const handleTimeChange = useCallback(
    (virtualTime: number) => {
      // Prevent infinite recursion - check if we're already at this time
      if (Math.abs(localCurrentTime - virtualTime) < 0.01) {
        return;
      }
      
      // Convert virtual time to actual media time
      const actualTime = virtualToActualTime(virtualTime, virtualTimeline);
      
      operations?.setCurrentTime(virtualTime);
      onTimeUpdate(virtualTime);
      setLocalCurrentTime(virtualTime);
      
      // Seek the media player to the actual time
      if (mediaPlayerRef.current) {
        mediaPlayerRef.current.seekTo(actualTime);
      }
    },
    [operations, onTimeUpdate, virtualTimeline, virtualToActualTime, localCurrentTime],
  );

  const handlePlayPause = useCallback(() => {
    if (mediaPlayerRef.current) {
      if (isPlaying) {
        mediaPlayerRef.current.pause();
      } else {
        mediaPlayerRef.current.play();
      }
    }
    setIsPlaying((prev) => !prev);
  }, [isPlaying]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
  }, []);

  const handleClipEdit = useCallback(
    (trackId: string, clipId: string, updates: any) => {
      operations?.editClip(trackId, clipId, updates);
    },
    [operations],
  );

  const handleClipDelete = useCallback(
    (trackId: string, clipId: string) => {
      operations?.deleteClip(trackId, clipId);
    },
    [operations],
  );

  const handleClipSplit = useCallback(
    (trackId: string, clipId: string, splitTime: number) => {
      operations?.splitClip(trackId, clipId, splitTime);
    },
    [operations],
  );

  const handleClipMerge = useCallback(
    (trackId: string, clipId1: string, clipId2: string) => {
      operations?.mergeClips(trackId, clipId1, clipId2);
    },
    [operations],
  );

  const handleClipCopy = useCallback(
    (trackId: string, clipId: string) => {
      operations?.copyClip(trackId, clipId);
    },
    [operations],
  );

  const handleTrackToggle = useCallback(
    (trackId: string, property: "visible" | "muted" | "locked") => {
      operations?.toggleTrack(trackId, property);
    },
    [operations],
  );

  const handleUndo = useCallback(() => {
    const success = operations?.undo();
    if (!success) {
      console.log("Nothing to undo");
    }
  }, [operations]);

  const handleRedo = useCallback(() => {
    const success = operations?.redo();
    if (!success) {
      console.log("Nothing to redo");
    }
  }, [operations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleManualSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleManualSave]);

  // Update timeline current time from external source
  useEffect(() => {
    if (
      operations &&
      timelineState &&
      Math.abs(timelineState.currentTime - currentTime) > 0.1
    ) {
      operations.setCurrentTime(currentTime);
    }
  }, [currentTime, operations, timelineState]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-gray-900 rounded-lg border border-gray-700">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading timeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="bg-red-900/20 border-red-600 text-red-200">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!operations || !timelineState) {
    return (
      <div className="flex items-center justify-center p-12 bg-gray-900 rounded-lg border border-gray-700">
        <div className="text-gray-400">Failed to initialize timeline</div>
      </div>
    );
  }

  const statistics = operations.getStatistics();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Media Player Preview */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        <div className="max-w-3xl mx-auto">
          <MediaPlayer
            ref={mediaPlayerRef}
            src={getMediaUrl(mediaFile)}
            type={mediaFile.type}
            onTimeUpdate={(actualTime) => {
              // Check if we're in a cut section and need to skip
              const nextValidTime = getNextValidTime(actualTime, activeClips);
              
              if (nextValidTime === -1) {
                // No more clips, pause
                if (mediaPlayerRef.current) {
                  mediaPlayerRef.current.pause();
                }
              } else if (nextValidTime !== actualTime) {
                // We're in a cut section, jump to next clip
                if (mediaPlayerRef.current) {
                  mediaPlayerRef.current.seekTo(nextValidTime);
                }
                return; // Don't update timeline until we're in a valid section
              }
              
              // Convert actual time to virtual time for the timeline
              const virtualTime = actualToVirtualTime(actualTime, virtualTimeline, activeClips);
              setLocalCurrentTime(virtualTime);
              onTimeUpdate(virtualTime);
              
              if (operations) {
                operations.setCurrentTime(virtualTime);
              }
              
              // Update last actual time
              lastActualTimeRef.current = actualTime;
            }}
            onSeek={(actualTime) => {
              // The media player gives us actual time, convert to virtual for timeline
              const virtualTime = actualToVirtualTime(actualTime, virtualTimeline, activeClips);
              
              setLocalCurrentTime(virtualTime);
              onTimeUpdate(virtualTime);
              
              if (operations) {
                operations.setCurrentTime(virtualTime);
              }
              
              // No need to seek again - the media player already did it
            }}
          />
        </div>
      </div>

      {/* Timeline Header with Stats and Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <span>Duration: {formatTime(virtualDuration > 0 ? virtualDuration : timelineState.duration)}</span>
          <span>Edited: {formatTime(virtualDuration)}</span>
          <span>Tracks: {statistics.totalTracks}</span>
          <span>Clips: {statistics.totalClips}</span>
          {statistics.lockedClips > 0 && (
            <span className="text-yellow-400">
              Locked: {statistics.lockedClips}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              Unsaved changes
            </span>
          )}

          <Button
            onClick={handleManualSave}
            disabled={isSaving || !hasUnsavedChanges}
            size="sm"
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Timeline Editor */}
      <TimelineEditor
        tracks={timelineState.tracks}
        duration={virtualDuration > 0 ? virtualDuration : timelineState.duration}
        currentTime={localCurrentTime}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        onTimeChange={handleTimeChange}
        onPlayPause={handlePlayPause}
        onPlaybackRateChange={handlePlaybackRateChange}
        onClipEdit={handleClipEdit}
        onClipDelete={handleClipDelete}
        onClipSplit={handleClipSplit}
        onClipMerge={handleClipMerge}
        onClipCopy={handleClipCopy}
        onTrackToggle={handleTrackToggle}
        onUndo={handleUndo}
        onRedo={handleRedo}
        className="min-h-[400px]"
        pixelsPerSecond={20}
        snapToGrid={true}
        gridInterval={1}
        showWaveforms={true}
        frameRate={30}
      />

      {/* Timeline Stats Footer */}
      <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>Zoom: {Math.round(timelineState.zoom * 100)}%</span>
          <span>Current: {formatTime(timelineState.currentTime)}</span>
          {playbackRate !== 1 && <span>Speed: {playbackRate}x</span>}
        </div>

        <div className="flex items-center gap-4">
          <span
            className={statistics.canUndo ? "text-blue-400" : "text-gray-600"}
          >
            Undo: {statistics.canUndo ? "Available" : "None"}
          </span>
          <span
            className={statistics.canRedo ? "text-blue-400" : "text-gray-600"}
          >
            Redo: {statistics.canRedo ? "Available" : "None"}
          </span>
        </div>
      </div>

      {/* Debug Info (Development Only) */}
      {process.env.NODE_ENV === "development" && (
        <details className="p-2 bg-gray-900 rounded text-xs text-gray-400">
          <summary className="cursor-pointer">Debug Info</summary>
          <pre className="mt-2 text-xs overflow-auto">
            {JSON.stringify(
              {
                mediaFileId: mediaFile.id,
                transcriptSegments: transcript?.segments?.length || 0,
                historyLength: timelineState.history.length,
                historyIndex: timelineState.historyIndex,
                statistics,
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </div>
  );
};

export default TimelineWrapper;
