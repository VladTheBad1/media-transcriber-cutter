# Media Transcription & Editing Studio - UI Components

A comprehensive, accessible UI component library built specifically for media transcription and editing applications using Next.js 14, TypeScript, and Tailwind CSS.

## Components Overview

### 🎬 Core Components

#### MediaUpload
Upload component with drag-and-drop support for media files and URL imports.

**Features:**
- Drag-and-drop file upload
- URL import (YouTube, Vimeo, podcasts)
- File validation and progress tracking
- Support for video/audio formats
- Accessibility compliant

**Usage:**
```tsx
import { MediaUpload } from '@/components/ui'

<MediaUpload
  onFilesUploaded={(files) => handleFiles(files)}
  onUrlImport={(url) => handleUrlImport(url)}
  maxFileSize={5 * 1024 * 1024 * 1024} // 5GB
  acceptedFormats={['.mp4', '.mov', '.mp3', '.wav']}
/>
```

#### MediaPlayer
Custom media player with timeline scrubbing and transcript integration.

**Features:**
- Video and audio playback support
- Custom transport controls
- Timeline scrubbing with frame accuracy
- Keyboard shortcuts (Space, Arrow keys)
- Transcript overlay display
- Playback speed control
- Fullscreen support (video)

**Usage:**
```tsx
import { MediaPlayer } from '@/components/ui'

<MediaPlayer
  src="/media/video.mp4"
  type="video"
  transcript={transcriptSegments}
  onTimeUpdate={handleTimeUpdate}
  onSeek={handleSeek}
/>
```

#### TranscriptViewer
Interactive transcript viewer with editing capabilities.

**Features:**
- Click-to-seek functionality
- In-line text editing
- Speaker identification and editing
- Search and highlight
- Confidence scoring visualization
- Export to multiple formats (SRT, VTT, TXT, JSON)
- Auto-scroll to current segment

**Usage:**
```tsx
import { TranscriptViewer } from '@/components/ui'

<TranscriptViewer
  segments={transcriptSegments}
  currentTime={currentTime}
  onSegmentClick={handleSegmentClick}
  onSegmentEdit={handleSegmentEdit}
  onExport={handleExport}
  editable={true}
/>
```

#### TimelineEditor
Professional timeline editor for video editing.

**Features:**
- Multi-track timeline (video, audio, text)
- Drag-and-drop clip manipulation
- Frame-accurate cutting and trimming
- Zoom controls and grid snapping
- Keyboard shortcuts
- Visual waveform representation
- Real-time playhead synchronization

**Usage:**
```tsx
import { TimelineEditor } from '@/components/ui'

<TimelineEditor
  tracks={timelineTracks}
  duration={totalDuration}
  currentTime={playheadTime}
  onTimeChange={setPlayheadTime}
  onClipEdit={handleClipEdit}
  onClipSplit={handleClipSplit}
/>
```

#### ExportSettings
Comprehensive export configuration with platform presets.

**Features:**
- Social media platform presets (TikTok, Instagram, YouTube, etc.)
- Custom export settings
- Quality and bitrate controls
- File size estimation
- Export time prediction
- Batch export queue
- Format validation

**Usage:**
```tsx
import { ExportSettings } from '@/components/ui'

<ExportSettings
  duration={videoDuration}
  onExport={handleExport}
  isExporting={exportInProgress}
  exportProgress={progressPercent}
/>
```

#### MediaLibrary
Comprehensive media file management with search and filtering.

**Features:**
- Grid and list view modes
- Advanced search and filtering
- Batch operations
- File status indicators
- Sorting options
- Thumbnail previews
- Metadata display

**Usage:**
```tsx
import { MediaLibrary } from '@/components/ui'

<MediaLibrary
  files={mediaFiles}
  viewMode="grid"
  onFileSelect={handleFileSelect}
  onFileDelete={handleFileDelete}
  onBatchOperation={handleBatchOperation}
/>
```

## Design System

### Color Palette
Based on the Media Transcription Studio design system:

- **Primary (Deep Blue)**: `#1E40AF` - Trust, professionalism
- **Secondary (Cyan)**: `#0891B2` - Technology, innovation  
- **Accent (Green)**: `#10B981` - Success, progress
- **Warning (Amber)**: `#F59E0B` - Attention, processing
- **Error (Red)**: `#EF4444` - Errors, critical states

### Typography
- **Primary Font**: Inter (with system font fallback)
- **Monospace Font**: JetBrains Mono (for technical content)
- **Responsive scaling**: 12px to 32px across breakpoints

### Responsive Breakpoints
- **Mobile**: < 768px (single column layout)
- **Tablet**: 768px - 1024px (two-column adaptive)
- **Desktop**: > 1024px (full three-column layout)

## Accessibility Features

### WCAG 2.1 AA Compliance
- **Keyboard Navigation**: Full functionality without mouse
- **Screen Reader Support**: Comprehensive ARIA labeling
- **High Contrast**: Support for high contrast display modes
- **Focus Management**: Visible focus indicators throughout
- **Text Scaling**: Readable at 200% browser zoom

### Keyboard Shortcuts
**Global Media Controls:**
- `Space`: Play/Pause
- `←/→`: Seek backward/forward
- `↑/↓`: Volume control
- `M`: Toggle mute
- `F`: Toggle fullscreen (video only)

**Timeline Editor:**
- `C`: Cut at playhead
- `V`: Paste
- `Delete`: Remove selected clips
- `Ctrl+A`: Select all clips
- `Ctrl+Z`: Undo

## Installation & Setup

### Prerequisites
- Next.js 14+
- TypeScript
- Tailwind CSS
- Required packages (see package.json)

### Installation
```bash
# Install required dependencies
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install @radix-ui/react-label @radix-ui/react-select @radix-ui/react-slider
npm install @radix-ui/react-tabs @radix-ui/react-tooltip
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react wavesurfer.js

# Copy components to your project
cp -r components/ui /your-project/components/
cp lib/utils.ts /your-project/lib/
```

### Tailwind Configuration
Add the design system colors to your `tailwind.config.js`:

```js
module.exports = {
  content: ['./components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E40AF',
          50: '#EFF6FF',
          // ... full color scale
        },
        // ... other design system colors
      }
    }
  }
}
```

## Performance Considerations

### Optimizations Implemented
- **Lazy Loading**: Components load content progressively
- **Virtual Scrolling**: Efficient rendering for long transcripts
- **Canvas Optimization**: Hardware-accelerated waveform rendering
- **Debounced Operations**: Smooth seeking and scrubbing
- **Memoization**: React.memo and useMemo for expensive operations

### Best Practices
- Use `React.Suspense` for lazy-loaded components
- Implement intersection observer for thumbnail loading
- Debounce user input for search and scrubbing
- Use CSS transforms for smooth animations

## Testing

### Component Testing
```bash
npm run test:components
```

### Accessibility Testing
```bash
npm run test:a11y
```

### Visual Regression Testing
```bash
npm run test:visual
```

## Browser Support

### Supported Browsers
- Chrome 90+
- Firefox 88+  
- Safari 14+
- Edge 90+

### Progressive Enhancement
- Graceful degradation for older browsers
- Fallbacks for unsupported media formats
- Alternative UI for limited capabilities

## Contributing

### Development Setup
```bash
git clone [repository-url]
cd transcriber-cutter
npm install
npm run dev
```

### Component Development Guidelines
1. **Accessibility First**: Every component must be fully accessible
2. **TypeScript Strict**: Full type coverage required
3. **Responsive Design**: Mobile-first approach
4. **Performance**: Optimize for large media files
5. **Testing**: Unit tests and accessibility tests required

### File Structure
```
components/ui/
├── media-upload.tsx       # File upload with progress
├── media-player.tsx       # Video/audio player
├── transcript-viewer.tsx  # Interactive transcript
├── timeline-editor.tsx    # Professional timeline
├── export-settings.tsx    # Export configuration
├── media-library.tsx      # File management
├── index.ts              # Component exports
└── README.md             # This documentation
```

## Examples

### Basic Implementation
```tsx
import { MediaPlayer, TranscriptViewer } from '@/components/ui'

export default function MediaEditor() {
  const [currentTime, setCurrentTime] = useState(0)
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <MediaPlayer
        src="/video.mp4"
        type="video"
        onTimeUpdate={setCurrentTime}
      />
      <TranscriptViewer
        segments={transcript}
        currentTime={currentTime}
        onSegmentClick={(segment) => setCurrentTime(segment.start)}
      />
    </div>
  )
}
```

### Advanced Workflow
```tsx
import { 
  MediaUpload, 
  MediaPlayer, 
  TimelineEditor, 
  TranscriptViewer, 
  ExportSettings 
} from '@/components/ui'

export default function FullEditor() {
  // Implementation for complete editing workflow
  return (
    <div className="space-y-6">
      <MediaUpload onFilesUploaded={handleUpload} />
      <MediaPlayer src={currentVideo} onTimeUpdate={setTime} />
      <TimelineEditor tracks={tracks} currentTime={time} />
      <TranscriptViewer segments={transcript} currentTime={time} />
      <ExportSettings duration={duration} onExport={handleExport} />
    </div>
  )
}
```

## License

MIT License - see LICENSE file for details.

## Support

For questions, issues, or contributions:
- Create an issue on GitHub
- Check the component demos at `/components-demo`
- Review the implementation in existing pages

---

**Built with ❤️ for the media creation community**