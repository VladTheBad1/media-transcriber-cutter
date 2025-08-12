# Media Transcription & Editing Service - UI Blueprints

## Design System Foundation

### Visual Identity
- **Primary Color**: Deep Blue (#1E40AF) - Trust, professionalism
- **Secondary Color**: Cyan (#0891B2) - Technology, innovation  
- **Accent Color**: Green (#10B981) - Success, progress
- **Warning Color**: Amber (#F59E0B) - Attention, processing
- **Error Color**: Red (#EF4444) - Errors, critical states
- **Neutral Colors**: Gray scale from #F9FAFB to #111827

### Typography
- **Primary Font**: Inter (system font fallback)
- **Monospace Font**: JetBrains Mono (code/technical content)
- **Heading Scale**: 2xl, xl, lg, base, sm, xs
- **Weight Scale**: light (300), normal (400), medium (500), semibold (600), bold (700)

### Design Principles
1. **Media-First**: Visual hierarchy prioritizes media content
2. **Workflow-Driven**: Interface follows natural content creation flow
3. **Progressive Disclosure**: Advanced features hidden until needed
4. **Real-time Feedback**: Immediate visual response to all interactions
5. **Accessibility**: WCAG 2.1 AA compliance throughout

## Layout Architecture

### Application Shell
```
┌─────────────────────────────────────────────────────────────┐
│                    Header Navigation                        │
├─────────────────────────────────────────────────────────────┤
│           │                                     │           │
│  Sidebar  │            Main Content             │  Inspector│
│    Nav    │                                     │   Panel   │
│           │                                     │           │
│           │                                     │           │
│           │                                     │           │
├─────────────────────────────────────────────────────────────┤
│                     Status Bar                              │
└─────────────────────────────────────────────────────────────┘
```

**Responsive Breakpoints:**
- Mobile: < 768px (single column, collapsible panels)
- Tablet: 768px - 1024px (adaptive two-column)
- Desktop: > 1024px (full three-column layout)

## Core UI Components

### 1. Upload Interface
```
┌─────────────────────────────────────────────────────────────┐
│                     Upload Zone                             │
│                                                             │
│    ┌─────────────────────────────────────────────────────┐  │
│    │                                                     │  │
│    │              📎 Drag files here                     │  │
│    │           or click to browse                        │  │
│    │                                                     │  │
│    │        Supports: MP4, MOV, MP3, WAV...             │  │
│    │              Max size: 5GB                          │  │
│    └─────────────────────────────────────────────────────┘  │
│                                                             │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ 🔗 Import from URL                                  │  │
│    │ [___________________________________] [Import]     │  │
│    │ YouTube, Vimeo, Podcast URLs supported             │  │
│    └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**States:**
- **Default**: Dotted border, subtle background
- **Drag Over**: Solid border, highlighted background
- **Uploading**: Progress bar with cancel option
- **Processing**: Spinner with status message

### 2. Media Player Component
```
┌─────────────────────────────────────────────────────────────┐
│                      Video Player                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │                   📺 Video Area                         │ │
│  │                                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ▶️ [===■=============================] 🔊 ⚙️           │ │
│  │    00:42                         15:30                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  Speed: [1x▼] | Quality: [720p▼] | Subtitles: [On▼]       │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Custom scrubbing with frame accuracy
- Playback speed control (0.25x to 2x)
- Keyboard shortcuts (Space, ←→, ↑↓)
- Subtitle overlay with speaker colors
- Waveform visualization below timeline

### 3. Timeline Editor
```
┌─────────────────────────────────────────────────────────────┐
│                     Timeline Editor                         │
│                                                             │
│ Video │████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ │
│ Audio │~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~████████│ │
│ Text  │ "Hello world"    "How are you today?"            │ │
│                                                             │
│ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────┐ │
│ │ 0:00│ 1:00│ 2:00│ 3:00│ 4:00│ 5:00│ 6:00│ 7:00│   8:00│ │
│ └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────────┘ │
│                                                             │
│ [Split] [Trim] [Delete] [Effects]     Zoom: [+] [-] [Fit] │
└─────────────────────────────────────────────────────────────┘
```

**Interactive Elements:**
- Drag clips to reorder
- Resize clips by dragging edges
- Right-click context menus
- Multi-selection with Shift/Ctrl
- Magnetic snap to other clips

### 4. Transcript Editor
```
┌─────────────────────────────────────────────────────────────┐
│                  Transcript Editor                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎤 Speaker 1 [00:15]                                   │ │
│ │ Hello everyone, welcome to today's podcast about...    │ │
│ │                                                         │ │
│ │ 🎤 Speaker 2 [01:23]                                   │ │
│ │ Thanks for having me! I'm excited to discuss...        │ │
│ │                                                         │ │
│ │ 🎤 Speaker 1 [02:07] ◄ Currently Playing              │ │
│ │ That's a great point. Let me ask you about...          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Export SRT] [Export VTT] [Export Text] [AI Summary]       │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Click any text to jump to that time
- Edit text inline with auto-save
- Speaker name editing
- Confidence indicators (color-coded)
- Search and replace functionality

### 5. AI Features Panel
```
┌─────────────────────────────────────────────────────────────┐
│                     AI Assistant                            │
│                                                             │
│ 📝 Summary                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Key Points:                                             │ │
│ │ • Main topic discussed was product development         │ │
│ │ • Timeline mentioned: Q2 2024 launch                   │ │
│ │ • Budget considerations for marketing campaign         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ✨ Suggested Highlights (3)                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. "Product Launch Timeline" [2:34 - 3:12] ⭐⭐⭐⭐⭐    │ │
│ │ 2. "Marketing Strategy" [7:22 - 8:45] ⭐⭐⭐⭐         │ │
│ │ 3. "Budget Discussion" [12:30 - 13:15] ⭐⭐⭐          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🎬 Auto Actions                                             │
│ [Remove Silence] [Enhance Audio] [Generate Chapters]       │
└─────────────────────────────────────────────────────────────┘
```

**AI Feedback:**
- Confidence stars for highlight quality
- Processing status indicators
- One-click actions with preview
- Customizable AI sensitivity settings

### 6. Export Panel
```
┌─────────────────────────────────────────────────────────────┐
│                      Export Center                          │
│                                                             │
│ Platform Presets:                                           │
│ ┌───────┬───────┬───────┬───────┬───────┬───────┬─────────┐ │
│ │TikTok │Insta  │YouTube│Twitter│LinkedIn│Custom │  More  │ │
│ │ 9:16  │ 1:1   │ 16:9  │ 16:9  │ 16:9   │       │   ▼    │ │
│ │ 3min  │ 90s   │ ∞     │ 2:20  │ 10min  │       │        │ │
│ └───────┴───────┴───────┴───────┴───────┴───────┴─────────┘ │
│                                                             │
│ Format: [MP4 ▼]  Quality: [High ▼]  Resolution: [1080p ▼] │
│                                                             │
│ ⚙️ Advanced Options                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☑ Include subtitles    ☑ Watermark                     │ │
│ │ ☐ Auto-crop subjects   ☑ Optimize file size            │ │
│ │ Bitrate: [5000 kbps]   Audio: [256 kbps]              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│              [Preview Export] [Start Export]               │
└─────────────────────────────────────────────────────────────┘
```

**Preview Features:**
- Side-by-side original vs export preview
- File size estimation
- Export time estimation
- Quality comparison metrics

### 7. Media Library
```
┌─────────────────────────────────────────────────────────────┐
│                     Media Library                           │
│                                                             │
│ Search: [🔍 ___________________] Filter: [All▼] Sort: [Date▼]│
│                                                             │
│ ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐ │
│ │ 📹      │ 📹      │ 📹      │ 🎵       │ 📹      │ 📹      │ │
│ │Interview│Webinar  │Tutorial │Podcast  │Demo     │Meeting  │ │
│ │15:30    │45:22    │8:45     │32:11    │3:22     │1:08:33  │ │
│ │Yesterday│3d ago   │1w ago   │2w ago   │1m ago   │2m ago   │ │
│ │✅📝✨    │✅📝     │✅       │✅📝✨    │⚠️       │✅       │ │
│ └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘ │
│                                                             │
│ Legend: ✅=Ready ⚠️=Processing 📝=Transcribed ✨=Highlights   │
│                                                             │
│ [Import File] [Import URL] [New Project] [Batch Operations] │
└─────────────────────────────────────────────────────────────┘
```

**Status Icons:**
- ✅ Processing complete
- ⚠️ Currently processing
- ❌ Processing failed
- 📝 Has transcript
- ✨ Has AI highlights
- 🎬 Has timeline edits

## Page Layouts

### 1. Dashboard/Home Page
```
┌─────────────────────────────────────────────────────────────┐
│ 🎬 Media Transcription & Editor          [Profile] [Settings]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                Quick Start                              │ │
│ │  📁 Import Media    🎯 Start Project    📚 View Library │ │
│ │                                                         │ │
│ │ Recent Files:                                           │ │
│ │ • Interview_2024_01_15.mp4 (Yesterday)                 │ │
│ │ • Podcast_Episode_42.mp3 (3 days ago)                  │ │
│ │ • Webinar_Recording.mov (1 week ago)                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                Processing Queue                         │ │
│ │  📊 3 files processing, 2 completed today              │ │
│ │                                                         │ │
│ │  ⚡ Transcription: interview.mp4 [████████░░] 80%      │ │
│ │  🎬 Export: highlight_reel.mp4 [████░░░░░░] 40%       │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. Project Editor (Main Interface)
```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Library    📄 interview.mp4    [Save] [Export]    │
├───┬─────────────────────────────────────────────────────┬───┤
│Nav│                Main Editor                          │Pro│
│   │  ┌─────────────────────────────────────────────────┐│per│
│📁 ││  │                                                 ││tie│
│📝 ││  │           Video Player                          ││s  │
│✂️ ││  │                                                 │├───┤
│✨ ││  └─────────────────────────────────────────────────┘│🎤 │
│📤 ││                                                      │Spk│
│   │  ┌─────────────────────────────────────────────────┐ │ers│
│   │  │              Timeline Editor                    │ ├───┤
│   │  │████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ │⚙️ │
│   │  └─────────────────────────────────────────────────┘ │Set│
│   │                                                      │   │
│   │  ┌─────────────────────────────────────────────────┐ │   │
│   │  │             Transcript View                     │ │   │
│   │  │ "Hello everyone and welcome..."                 │ │   │
│   │  └─────────────────────────────────────────────────┘ │   │
├───┴─────────────────────────────────────────────────────┴───┤
│ Status: Ready | Duration: 15:30 | Progress: Transcribed     │
└─────────────────────────────────────────────────────────────┘
```

### 3. Mobile/Responsive Layout
```
┌─────────────────────┐
│ ☰ Media Editor  👤  │
├─────────────────────┤
│                     │
│    📱 Simplified    │
│      Interface      │
│                     │
│ ┌─────────────────┐ │
│ │   Video Player  │ │
│ │                 │ │
│ └─────────────────┘ │
│                     │
│ [Play] [■] [Export] │
│                     │
│ ┌─────────────────┐ │
│ │   Transcript    │ │
│ │ "Welcome to..." │ │
│ │                 │ │
│ └─────────────────┘ │
│                     │
│ [Edit] [Share] [AI] │
└─────────────────────┘
```

## Interaction Patterns

### 1. Media Processing Flow
```
Upload → [Processing Indicator] → Media Player Available
   ↓
Auto-start Transcription → [Progress Bar] → Transcript Ready
   ↓
AI Analysis (Background) → Highlights + Summary Available
```

### 2. Editing Workflow
```
Select Media → Timeline View → Make Edits → Preview → Export
     ↓             ↓             ↓           ↓        ↓
  Properties   Track Controls  Real-time   Quality   Format
   Panel        Available     Preview     Check     Options
```

### 3. Keyboard Shortcuts
```
Global:
- Space: Play/Pause
- ← →: Frame by frame (when paused) / Skip (when playing)
- ↑ ↓: Volume up/down
- Ctrl+Z: Undo
- Ctrl+Y: Redo

Timeline:
- C: Cut at playhead
- V: Paste
- Delete: Remove selected
- Ctrl+A: Select all
- Shift+Click: Select range
```

## Error States & Loading

### 1. Loading States
```
┌─────────────────────────────────────────┐
│          🔄 Processing Media            │
│                                         │
│  ████████████████████░░░░░░░░░░ 68%     │
│                                         │
│  Extracting audio... (2 min remaining) │
│                                         │
│           [Cancel Process]              │
└─────────────────────────────────────────┘
```

### 2. Error States
```
┌─────────────────────────────────────────┐
│          ⚠️ Processing Failed           │
│                                         │
│  Unable to process video file           │
│  Error: Unsupported codec (H.265)      │
│                                         │
│  Suggested fixes:                       │
│  • Try converting to MP4 first          │
│  • Check file isn't corrupted          │
│                                         │
│      [Retry] [Get Help] [Cancel]       │
└─────────────────────────────────────────┘
```

### 3. Empty States
```
┌─────────────────────────────────────────┐
│              📁 No Media Files          │
│                                         │
│   Get started by uploading your first  │
│           video or audio file           │
│                                         │
│        [📁 Upload File] [🔗 Import URL] │
│                                         │
│   Or drag and drop files anywhere      │
└─────────────────────────────────────────┘
```

## Accessibility Features

### 1. Keyboard Navigation
- Tab order follows logical workflow
- All interactive elements focusable
- Visual focus indicators on all controls
- Skip links for main content areas

### 2. Screen Reader Support
- Semantic HTML structure
- ARIA labels for complex interactions
- Live regions for status updates
- Alt text for all meaningful images

### 3. Visual Accessibility
- High contrast mode support
- Scalable text up to 200%
- Color blind friendly palette
- Reduced motion options

### 4. Audio Accessibility
- Visual waveforms for deaf users
- Subtitle display options
- Haptic feedback where supported
- Audio description support

## Performance Considerations

### 1. Progressive Loading
- Lazy load transcript segments
- Progressive video quality loading
- Thumbnail pregeneration
- Component code splitting

### 2. Responsive Images
- Multiple resolution thumbnails
- WebP format with fallbacks
- Proper aspect ratio containers
- Intersection observer loading

### 3. State Management
- Local state for UI interactions
- Global state for media processing
- Optimistic updates for better UX
- Efficient re-rendering patterns

This UI blueprint provides a comprehensive foundation for building an intuitive, powerful, and accessible media transcription and editing interface that scales from simple transcription tasks to complex video editing workflows.