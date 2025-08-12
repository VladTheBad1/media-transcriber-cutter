#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();

async function updateTestMedia() {
  try {
    // Update the test media file to point to our real audio file
    const testFilePath = path.join(process.cwd(), 'test-assets', 'test-audio.wav');
    
    const updated = await prisma.mediaFile.updateMany({
      where: {
        filename: 'test-video.mp4'
      },
      data: {
        filename: 'test-audio.wav',
        originalName: 'Test Audio.wav',
        filePath: testFilePath,
        type: 'audio',
        format: 'wav'
      }
    });

    console.log('Updated test media files:', updated.count);
    
    // List all media files
    const allMedia = await prisma.mediaFile.findMany();
    console.log('\nAll media files:');
    allMedia.forEach(media => {
      console.log(`- ${media.originalName} (${media.id}) - ${media.filePath}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateTestMedia();