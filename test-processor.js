const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testFFprobe() {
  try {
    const filePath = '/app/uploads/57135f0a-6f78-463b-a05d-4fe0c528ad60.mp4';
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );
    
    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find(s => s.codec_type === 'video');
    const duration = parseFloat(data.format?.duration || '0');
    
    console.log('Duration:', duration);
    console.log('Resolution:', videoStream?.width + 'x' + videoStream?.height);
    console.log('Success!');
  } catch (error) {
    console.error('Error:', error);
  }
}

testFFprobe();