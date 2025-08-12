# Video Export System - ✅ FULLY IMPLEMENTED

**Status**: 🚀 **PRODUCTION READY** - Complete FFmpeg-based video export pipeline with timeline editing, multi-platform presets, subtitle generation, and batch processing.

A comprehensive export system that compiles timeline segments into final videos with platform-specific optimization, subtitle generation, and advanced processing features.

## Features

### 🎯 Platform-Specific Presets
- **TikTok**: 9:16 vertical, 3-minute max, optimized for mobile viewing
- **Instagram Reels**: 9:16 vertical, 90-second max, high-quality compression
- **Instagram Posts**: 1:1 square, 60-second max, feed-optimized
- **YouTube Shorts**: 9:16 vertical, 60-second max, platform-compliant
- **YouTube Standard**: 16:9 horizontal, unlimited duration, high-quality
- **Twitter/X**: 16:9 horizontal, 2:20 max, auto-play optimized
- **LinkedIn**: 16:9 horizontal, 10-minute max, professional quality
- **Facebook**: 16:9 horizontal, 4-minute max, social-optimized

### 🤖 AI-Powered Auto-Crop
- **Face Detection**: Automatic subject tracking and framing
- **Smart Cropping**: Intelligent crop suggestions for different aspect ratios
- **Smooth Movement**: Anti-jitter technology for professional results
- **Preview System**: Real-time crop preview before export

### 📝 Advanced Subtitle Integration
- **Multiple Formats**: SRT, VTT, ASS, and burned-in subtitles
- **Custom Styling**: Font families, sizes, colors, shadows, and positioning
- **Platform Optimization**: Subtitle styling optimized for each platform
- **Timing Optimization**: Automatic timing adjustments for readability

### ⚡ High-Performance Processing
- **Queue System**: Redis-based job queue with priority support
- **Batch Processing**: Multi-platform exports with progress tracking
- **Progress Monitoring**: Real-time progress updates and time estimates
- **Error Recovery**: Automatic retry logic with exponential backoff

### 🎛️ Quality Control
- **Multiple Quality Presets**: Ultra-low to lossless quality options
- **Validation System**: Pre-export validation with warnings and errors
- **Preview Generation**: Quick preview before full export
- **File Size Estimation**: Accurate size and time predictions

## Architecture

```
lib/export/
├── types.ts              # TypeScript interfaces and types
├── presets.ts            # Platform-specific export presets
├── subtitle-generator.ts # Subtitle generation and styling
├── auto-crop.ts          # AI-powered auto-crop functionality
├── video-exporter.ts     # Core video export engine
├── queue.ts              # Export job queue management
└── index.ts              # Main exports and utilities
```

## Usage Examples

### Basic Single Export

```typescript
import { useExport, SOCIAL_MEDIA_PRESETS } from '@/lib/export'

const { startExport } = useExport()

// Start a TikTok export
const jobId = await startExport({
  mediaFileId: 'media123',
  presetId: 'tiktok-vertical',
  outputFilename: 'my-tiktok-video.mp4',
  options: {
    includeSubtitles: true,
    subtitleStyle: 'burned',
    autoCrop: true,
    audioNormalization: true
  }
})
```

### Batch Multi-Platform Export

```typescript
// Export to multiple platforms simultaneously
const batchId = await startBatchExport({
  mediaFileId: 'media123',
  baseFilename: 'my-content',
  platforms: ['TikTok', 'Instagram', 'YouTube'],
  options: {
    includeSubtitles: true,
    outputDirectory: 'social-exports'
  }
})
```

### Custom Export Preset

```typescript
import { ExportPreset } from '@/lib/export'

const customPreset: ExportPreset = {
  id: 'custom-4k',
  name: 'Custom 4K',
  platform: 'Custom',
  description: '4K export with premium settings',
  video: {
    codec: 'h264',
    resolution: { width: 3840, height: 2160 },
    aspectRatio: '16:9',
    bitrate: '25000k',
    fps: 60,
    format: 'mp4',
    profile: 'high',
    level: '5.1'
  },
  audio: {
    codec: 'aac',
    bitrate: '320k',
    sampleRate: 48000,
    channels: 2
  },
  subtitles: {
    format: 'srt',
    enabled: true,
    style: {
      fontFamily: 'Roboto',
      fontSize: 24,
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.8)',
      alignment: 'center'
    }
  },
  optimization: {
    twoPass: true,
    fastStart: true,
    webOptimized: true,
    compressionLevel: 'ultra'
  }
}
```

### Preview Generation

```typescript
// Generate a 10-second preview
const previewUrl = await generatePreview({
  mediaFileId: 'media123',
  presetId: 'youtube-shorts',
  previewDuration: 10,
  startTime: 30 // Start preview at 30 seconds
})
```

### Queue Management

```typescript
import { getExportQueue } from '@/lib/export'

const queue = getExportQueue()

// Get queue statistics
const stats = queue.getStats()

// Pause/resume queue
await queue.pauseQueue()
await queue.resumeQueue()

// Cancel specific job
await queue.cancelJob('job123')

// Retry failed job
await queue.retryJob('job456')
```

## Component Usage

### Export Settings Component

```typescript
import { ExportSettingsAdvanced } from '@/components/ui/export-settings-advanced'

<ExportSettingsAdvanced
  mediaFileId="media123"
  duration={120} // 2 minutes
  onExport={(jobId) => console.log('Export started:', jobId)}
  onPreview={(previewUrl) => console.log('Preview:', previewUrl)}
/>
```

### Export Monitor Component

```typescript
import { ExportMonitor } from '@/components/ui/export-monitor'

<ExportMonitor
  showCompleted={true}
  showFailed={true}
  maxItems={10}
/>
```

## API Endpoints

### Presets
- `GET /api/export/presets` - Get all available presets
- `POST /api/export/presets/validate` - Validate preset against media

### Export Jobs
- `POST /api/export/start` - Start single export job
- `PUT /api/export/start` - Start batch export job
- `GET /api/export/status/[jobId]` - Get job status
- `POST /api/export/status/[jobId]` - Update job (cancel, retry)
- `DELETE /api/export/status/[jobId]` - Cancel job

### Queue Management  
- `GET /api/export/queue` - Get queue status and jobs
- `POST /api/export/queue` - Queue actions (pause, resume, clear)
- `DELETE /api/export/queue` - Clear all jobs

### Preview
- `POST /api/export/preview` - Generate export preview
- `DELETE /api/export/preview` - Clean up preview files

## Configuration

### Queue Options

```typescript
const queueOptions = {
  maxConcurrentJobs: 2,     // Max simultaneous exports
  retryAttempts: 3,         // Auto-retry failed jobs
  retryDelay: 5000,         // Delay between retries (ms)
  priorityLevels: 5,        // Number of priority levels
  tempDir: './temp/export', // Temporary files directory
  outputDir: './exports'    // Export output directory
}

const queue = new ExportQueue(queueOptions)
```

### Auto-Crop Options

```typescript
const autoCropOptions = {
  targetAspectRatio: '9:16',
  enableFaceTracking: true,
  enableObjectTracking: false,
  smoothingFactor: 0.7,      // 0-1, higher = smoother
  minConfidence: 0.5,        // Minimum detection confidence
  paddingPercent: 10,        // Padding around subjects
  maxCropMovement: 20,       // Max pixels crop can move
  sampleInterval: 1.0        // Seconds between samples
}
```

## Performance Considerations

### Export Speed Optimization
- **Hardware Acceleration**: Utilizes GPU encoding when available
- **Two-Pass Encoding**: Optional for maximum quality
- **Preset Selection**: Balance quality vs. speed based on needs
- **Concurrent Processing**: Multiple jobs processed simultaneously

### File Size Optimization
- **Bitrate Calculation**: Smart bitrate selection based on content
- **Compression Levels**: Multiple levels from fast to ultra-compressed
- **Format Selection**: Optimal format for each platform
- **Quality Presets**: Predefined quality/size trade-offs

### Memory Management
- **Streaming Processing**: Large files processed in chunks
- **Temporary File Cleanup**: Automatic cleanup of intermediate files
- **Resource Monitoring**: CPU and memory usage tracking
- **Queue Limits**: Configurable limits prevent system overload

## Error Handling

### Validation Errors
- **Format Compatibility**: Check input format support
- **Duration Limits**: Validate against platform constraints
- **File Size Limits**: Check estimated output size
- **Resolution Limits**: Validate resolution requirements

### Processing Errors
- **Codec Issues**: Fallback to compatible codecs
- **File System Errors**: Handle disk space and permissions
- **Network Errors**: Retry logic for network operations
- **Resource Errors**: Handle memory and CPU limitations

### Recovery Strategies
- **Automatic Retry**: Failed jobs automatically retried
- **Graceful Degradation**: Fallback to lower quality on resource constraints
- **Progress Persistence**: Resume interrupted exports
- **Error Reporting**: Detailed error messages and logging

## Best Practices

### Export Quality
1. **Choose Appropriate Presets**: Use platform-specific presets for optimal results
2. **Preview Before Export**: Always generate previews for important content
3. **Monitor File Sizes**: Check estimated sizes against platform limits
4. **Test Auto-Crop**: Preview auto-crop results before batch processing

### Performance Optimization
1. **Batch Similar Jobs**: Group exports with similar settings
2. **Use Priority Queuing**: Set appropriate priorities for urgent exports
3. **Monitor System Resources**: Keep an eye on CPU and memory usage
4. **Clean Up Regularly**: Remove old preview and temporary files

### Subtitle Best Practices
1. **Font Selection**: Choose readable fonts for target platforms
2. **Timing Optimization**: Ensure adequate display time for text
3. **Style Consistency**: Use consistent styling across platform exports
4. **Accessibility**: Include subtitles for accessibility compliance

## Troubleshooting

### Common Issues

**Export Fails with "Codec Not Supported"**
- Ensure FFmpeg is properly installed with codec support
- Check that input file format is supported
- Try using a different preset or codec

**Auto-Crop Not Working**
- Verify face detection models are available
- Check that video has detectable subjects
- Try adjusting confidence thresholds

**Preview Generation Slow**
- Reduce preview duration
- Use lower quality settings for previews
- Check system resources and concurrent jobs

**Queue Not Processing Jobs**
- Check queue status (paused/resumed)
- Verify system resources are available
- Check for failed dependencies

### Debug Mode

Enable debug logging:

```typescript
process.env.EXPORT_DEBUG = 'true'
process.env.FFMPEG_DEBUG = 'true'
```

This will provide detailed logging for troubleshooting export issues.

## License

This export system is part of the Media Transcription & Editing Studio project and follows the same licensing terms.