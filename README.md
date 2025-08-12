## Overview

This is an online video editor built with nextjs, remotion for real-time preview and ffmpeg (web assembly port) for high-quality render.

## Features

### Core Video Editing
- 🎞️ Real-time Preview: See immediate previews of edits.
- 🧰 Render with ffmpeg (web assembly port) with various options supports up to 1080p export.
- 🕹️ Interactive Timeline Editor: Precisely arrange, trim, and control media through a custom-built timeline.
- ✂️ Element Utilities: Easily split, duplicate, and manage individual media layers.
- 🖼️ Flexible Media Support: Import and mix videos, audio tracks, images, and text elements seamlessly.
- 🛠️ Advanced Element Controls: Adjust properties like position, opacity, z-index and volume per element.
- ⌨️ Keyboard Shortcuts: Quickly play, mute, move in time with arrows, split, duplicate, etc.

### AI-Powered Features
- 🎤 **WhisperX Transcription**: High-accuracy speech-to-text with speaker diarization and word-level timestamps
- 🤖 **Smart Highlight Generation**: Automatically detect engaging moments, laughter, applause, and key segments
- 📱 **Social Media Clips**: AI-generated short clips optimized for social platforms (15-60 seconds)
- 📚 **Chapter Markers**: Automatic topic detection and chapter generation for long-form content
- 🔇 **Silence Removal**: Intelligent detection and removal of long pauses and dead air
- 💭 **Content Analysis**: Sentiment analysis, keyword extraction, and speaker insights
- 📊 **Smart Summaries**: Generate brief, detailed, or executive summaries with key points and action items
- 🎯 **Content-Aware Editing**: Detect questions, emphasis, topic changes, and audience reactions

![Alt Text](/images/image.png)

## Installation

Clone the repo, install dependencies:

```bash
npm install
```
Then run the development server:
```bash
npm run dev
```
Or build and start in production mode:

```bash
npm run build
npm start
```

Alternatively, use Docker:

```bash
# Build the Docker image
docker build -t clipjs .

# Run the container
docker run -p 3000:3000 clipjs
```
Then navigate to [http://localhost:3000](http://localhost:3000)

## AI Features Setup

### WhisperX Transcription

1. **Install Python Dependencies**:
```bash
pip install whisperx torch
```

2. **Environment Variables**:
```bash
# Optional: for diarization features
HUGGING_FACE_HUB_TOKEN=your_hf_token_here

# Database
DATABASE_URL="file:./dev.db"
```

3. **Initialize Database**:
```bash
npx prisma generate
npx prisma db push
```

### AI Analysis Features

The application includes several AI-powered analysis tools:

#### Highlight Generation
Automatically detect and create highlights based on:
- **Engagement metrics**: High-confidence speech, rapid dialogue
- **Content analysis**: Laughter, applause, emphasis, questions
- **Speaker dynamics**: Transitions, dominance changes
- **Sentiment analysis**: Positive, excited, emphatic moments
- **Keyword matching**: Custom keyword detection
- **Social clips**: Optimized 15-60 second segments

#### Content Types Supported
- **Social Media**: Short, engaging clips with high emotional content
- **Educational**: Key learning moments, questions, topic changes
- **Podcast**: Speaker interactions, engaging discussions
- **Presentation**: Key points, audience reactions, Q&A
- **Interview**: Important answers, speaker transitions
- **Comprehensive**: Full analysis with all detection methods

## API Usage

### Transcription
```bash
# Upload and transcribe media
POST /api/transcribe
{
  "mediaFileId": "file_id",
  "options": {
    "language": "en",
    "enableDiarization": true,
    "maxSpeakers": 5
  }
}
```

### Highlight Generation
```bash
# Generate highlights for a transcript
POST /api/highlights
{
  "transcriptId": "transcript_id",
  "criteria": {
    "analysisType": "social", // social, educational, podcast, etc.
    "highlightCount": 10,
    "socialMediaLength": 30,
    "detectLaughter": true,
    "enableSentimentAnalysis": true
  }
}

# Advanced analysis
POST /api/highlights/analyze
{
  "transcriptId": "transcript_id",
  "analysisType": "comprehensive",
  "returnFormat": "detailed" // detailed, summary, metrics
}

# Batch processing
POST /api/highlights/batch
{
  "mediaFileIds": ["id1", "id2"],
  "analysisType": "social",
  "saveToDatabase": true
}
```

### Summary Generation
```bash
# Generate content summary
POST /api/summaries
{
  "transcriptId": "transcript_id",
  "options": {
    "type": "detailed", // brief, detailed, bullet_points, executive
    "length": "medium", // short, medium, long
    "focus": "key_points", // key_points, action_items, insights
    "includeTimestamps": true,
    "extractQuotes": true,
    "generateActionItems": true
  }
}
```

## Analysis Presets

### Social Media
- **Focus**: Short, engaging clips (15-60s)
- **Detection**: Laughter, applause, emphasis, positive sentiment
- **Output**: Multiple short clips ready for social platforms

### Educational Content
- **Focus**: Learning moments, topic changes, Q&A
- **Detection**: Questions, key terms, explanations
- **Output**: Chapter markers and key concept highlights

### Podcast
- **Focus**: Speaker dynamics and engaging conversations
- **Detection**: Speaker transitions, laughter, insights
- **Output**: Highlight reel and chapter markers

### Presentation
- **Focus**: Key points and audience engagement
- **Detection**: Applause, emphasis, topic transitions
- **Output**: Key moments and audience reaction clips

### Interview
- **Focus**: Important answers and speaker interactions
- **Detection**: Questions, emphasis, sentiment changes
- **Output**: Key Q&A moments and insights

## Performance

- **Transcription Speed**: ~0.1x realtime (10min audio → 1min processing)
- **Accuracy**: >95% for clear audio with diarization
- **Languages**: 99 languages supported by WhisperX
- **Highlight Detection**: Configurable confidence thresholds
- **Batch Processing**: Multiple files with progress tracking

## TODOs

Prioritized tasks are listed in [TODO.md](./TODO.md). 

contributions are welcomed!
