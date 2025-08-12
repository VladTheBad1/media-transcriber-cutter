# AI Features Usage Guide

This guide demonstrates how to use the AI-powered features in the transcriber-cutter application.

## Quick Start

### 1. Upload and Transcribe Media

```javascript
// Upload a media file first, then transcribe
const transcribeResponse = await fetch('/api/transcribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaFileId: 'your-media-file-id',
    options: {
      language: 'auto', // or specific language code
      enableDiarization: true,
      maxSpeakers: 5,
      model: 'large-v2'
    }
  })
});

const transcription = await transcribeResponse.json();
console.log('Transcription completed:', transcription.transcriptId);
```

### 2. Generate Smart Highlights

```javascript
// Generate highlights optimized for social media
const highlightsResponse = await fetch('/api/highlights', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptId: transcription.transcriptId,
    criteria: {
      analysisType: 'social',
      highlightCount: 15,
      socialMediaLength: 30,
      detectLaughter: true,
      detectApplause: true,
      detectEmphasis: true,
      enableSentimentAnalysis: true,
      targetSentiments: ['positive', 'excited', 'emphatic']
    }
  })
});

const highlights = await highlightsResponse.json();
console.log(`Generated ${highlights.highlights.length} highlight suggestions`);
```

### 3. Create Content Summary

```javascript
// Generate a detailed summary with action items
const summaryResponse = await fetch('/api/summaries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptId: transcription.transcriptId,
    options: {
      type: 'detailed',
      length: 'medium',
      focus: 'key_points',
      includeTimestamps: true,
      extractQuotes: true,
      generateActionItems: true,
      sentimentAnalysis: true
    }
  })
});

const summary = await summaryResponse.json();
console.log('Summary generated:', summary.summary.content);
```

## Advanced Usage Examples

### Educational Content Processing

```javascript
// Optimized for educational videos, lectures, tutorials
const educationalAnalysis = await fetch('/api/highlights/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptId: 'transcript-id',
    analysisType: 'educational',
    criteria: {
      detectQuestions: true,
      detectTopicChanges: true,
      detectEmphasis: true,
      keywords: ['important', 'key concept', 'remember', 'note'],
      keywordWeight: 0.6,
      minSegmentDuration: 10,
      maxSegmentDuration: 120,
      highlightCount: 15,
      chapterMinLength: 180 // 3 minutes minimum per chapter
    },
    returnFormat: 'detailed'
  })
});

const analysis = await educationalAnalysis.json();

// The response includes:
// - highlights: Key learning moments
// - chapters: Topic-based chapter markers  
// - metrics: Confidence and engagement scores
console.log('Educational highlights:', analysis.highlights);
console.log('Chapter markers:', analysis.chapters);
```

### Podcast Highlight Reel

```javascript
// Generate engaging clips for podcast promotion
const podcastHighlights = await fetch('/api/highlights/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptId: 'podcast-transcript-id',
    analysisType: 'podcast',
    criteria: {
      speakerChangeWeight: 0.4,
      detectLaughter: true,
      detectEmphasis: true,
      enableSentimentAnalysis: true,
      minSegmentDuration: 8,
      maxSegmentDuration: 90,
      highlightCount: 12,
      socialMediaLength: 45 // Slightly longer for podcast clips
    },
    generateChapters: true
  })
});

const podcastAnalysis = await podcastHighlights.json();

// Extract the best clips for social media
const socialClips = podcastAnalysis.highlights.filter(h => 
  h.type === 'social_clip' && h.engagement > 0.8
);

console.log(`Found ${socialClips.length} high-engagement social clips`);
```

### Batch Processing Multiple Files

```javascript
// Process multiple media files at once
const batchResponse = await fetch('/api/highlights/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaFileIds: [
      'file-1-id',
      'file-2-id', 
      'file-3-id'
    ],
    analysisType: 'comprehensive',
    criteria: {
      highlightCount: 10,
      enableSentimentAnalysis: true,
      generateChapters: true
    },
    saveToDatabase: true
  })
});

const batchResults = await batchResponse.json();

// Check results for each file
batchResults.results.forEach(result => {
  if (result.success) {
    console.log(`${result.filename}: ${result.highlightCount} highlights generated`);
  } else {
    console.error(`${result.filename}: ${result.error}`);
  }
});

console.log('Batch summary:', batchResults.summary);
```

### Custom Analysis with Keywords

```javascript
// Target specific keywords and topics
const customAnalysis = await fetch('/api/highlights/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptId: 'business-meeting-transcript',
    analysisType: 'comprehensive',
    criteria: {
      keywords: [
        'revenue', 'growth', 'strategy', 'market', 'customers',
        'product', 'launch', 'timeline', 'budget', 'roi'
      ],
      keywordWeight: 0.8, // High weight for keyword matches
      detectEmphasis: true,
      detectQuestions: true,
      enableSentimentAnalysis: true,
      targetSentiments: ['positive', 'negative', 'emphatic'],
      minSegmentDuration: 15,
      maxSegmentDuration: 180
    },
    returnFormat: 'detailed'
  })
});

const businessInsights = await customAnalysis.json();

// Generate executive summary
const execSummary = await fetch('/api/summaries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptId: 'business-meeting-transcript',
    options: {
      type: 'executive',
      length: 'short',
      focus: 'action_items',
      generateActionItems: true
    }
  })
});

const summary = await execSummary.json();
console.log('Executive Summary:', summary.summary.content);
console.log('Action Items:', summary.summary.actionItems);
```

### Silence Removal for Clean Audio

```javascript
// Detect and remove long silences
const silenceAnalysis = await fetch('/api/highlights', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptId: 'interview-transcript',
    criteria: {
      maxSilenceDuration: 1.5, // Flag silences longer than 1.5 seconds
      minSegmentDuration: 3,
      detectEmphasis: false,
      detectLaughter: false,
      // Focus only on silence removal
      highlightCount: 50
    }
  })
});

const results = await silenceAnalysis.json();

// Filter for silence removal suggestions
const silenceRemovals = results.highlights.filter(h => 
  h.type === 'silence_removal' && h.duration > 2
);

console.log(`Found ${silenceRemovals.length} silence segments to remove`);
console.log(`Total silence duration: ${silenceRemovals.reduce((sum, s) => sum + s.duration, 0).toFixed(1)}s`);
```

### Real-time Analysis Progress

```javascript
// Start analysis and poll for progress
async function analyzeWithProgress(transcriptId) {
  // Start analysis
  const analysisResponse = await fetch('/api/highlights/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcriptId,
      analysisType: 'comprehensive',
      saveToDatabase: false // Don't save yet, just analyze
    })
  });
  
  if (!analysisResponse.ok) {
    throw new Error('Analysis failed to start');
  }
  
  const analysis = await analysisResponse.json();
  
  console.log('Analysis complete:');
  console.log(`- ${analysis.highlights.length} highlights found`);
  console.log(`- Average confidence: ${analysis.metrics.averageConfidence.toFixed(2)}`);
  console.log(`- Processing time: ${analysis.processingTime?.toFixed(2)}s`);
  
  return analysis;
}

// Usage
try {
  const results = await analyzeWithProgress('your-transcript-id');
  
  // Save the best highlights
  const topHighlights = results.highlights
    .filter(h => h.confidence > 0.8 && h.engagement > 0.7)
    .slice(0, 5);
    
  console.log('Top 5 highlights:', topHighlights);
} catch (error) {
  console.error('Analysis failed:', error);
}
```

## Configuration Presets

### Get Available Analysis Presets

```javascript
const presetsResponse = await fetch('/api/highlights/analyze?type=presets');
const presets = await presetsResponse.json();

console.log('Available presets:', Object.keys(presets.presets));
// Output: ['social', 'educational', 'podcast', 'presentation', 'interview', 'comprehensive']

// Use a preset
const socialPreset = presets.presets.social;
console.log('Social preset defaults:', socialPreset.defaults);
```

### Check Analysis Options

```javascript
const optionsResponse = await fetch('/api/highlights/analyze?type=options');
const options = await optionsResponse.json();

console.log('Analysis types:', options.options.analysisTypes);
console.log('Return formats:', options.options.returnFormats);
console.log('Available criteria:', options.options.criteria);
```

### Monitor Batch Processing Status

```javascript
// Check recent batch processing activity
const statusResponse = await fetch('/api/highlights/batch?action=status');
const status = await statusResponse.json();

console.log('Recent activity:', status.recentActivity);

// Get available files for batch processing
const availableResponse = await fetch('/api/highlights/batch?action=available');
const available = await availableResponse.json();

console.log(`${available.total} files available for processing`);
available.availableFiles.forEach(file => {
  console.log(`- ${file.filename} (${file.duration}s, ${file.transcriptLanguage})`);
});
```

## Error Handling

```javascript
async function robustAnalysis(transcriptId) {
  try {
    const response = await fetch('/api/highlights/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcriptId,
        analysisType: 'comprehensive'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Analysis failed: ${error.error} - ${error.details}`);
    }

    const results = await response.json();
    
    if (results.highlights.length === 0) {
      console.warn('No highlights generated - check transcript quality');
      return null;
    }

    return results;

  } catch (error) {
    console.error('Analysis error:', error.message);
    
    // Fallback to simpler analysis
    try {
      const simpleResponse = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptId,
          criteria: {
            minConfidence: 0.5, // Lower threshold
            highlightCount: 5,
            detectEmphasis: true
          }
        })
      });
      
      if (simpleResponse.ok) {
        const fallback = await simpleResponse.json();
        console.log('Fallback analysis completed');
        return fallback;
      }
    } catch (fallbackError) {
      console.error('Fallback analysis also failed:', fallbackError);
    }

    return null;
  }
}
```

## Best Practices

### 1. Choose the Right Analysis Type
- **Social Media**: For viral moments and engaging clips
- **Educational**: For learning content and tutorials  
- **Podcast**: For conversational content with multiple speakers
- **Presentation**: For formal talks and conferences
- **Interview**: For Q&A sessions and interviews
- **Comprehensive**: When you need all analysis methods

### 2. Optimize Criteria for Your Content
- **High-quality audio**: Use higher confidence thresholds (0.8+)
- **Noisy audio**: Lower confidence thresholds (0.6+)
- **Long content**: Increase max segment duration and chapter length
- **Short content**: Focus on shorter highlights and social clips

### 3. Batch Processing for Efficiency
- Process multiple similar files together
- Use consistent analysis types across batches
- Monitor processing status for large batches

### 4. Combine Features for Best Results
- Generate highlights AND summaries for complete analysis
- Use keyword filtering for targeted content discovery
- Apply silence removal before creating final highlights

This guide covers the main AI features available. Experiment with different settings to find what works best for your specific content type and use case.