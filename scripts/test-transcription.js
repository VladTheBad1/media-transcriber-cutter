#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

async function testTranscription() {
  try {
    // Create a test media file in the database
    const testMedia = await prisma.mediaFile.create({
      data: {
        filename: 'test-video.mp4',
        originalName: 'Test Video.mp4',
        filePath: path.join(process.cwd(), 'test-assets', 'test-video.mp4'),
        type: 'video',
        format: 'mp4',
        size: BigInt(1024 * 1024), // 1MB
        duration: 60,
        resolution: '1920x1080',
        status: 'READY',
        tags: ''
      }
    });

    console.log('Created test media file:', testMedia);
    console.log('Media ID:', testMedia.id);
    console.log('\nNow you can test the transcription button with this media file in the UI');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTranscription();