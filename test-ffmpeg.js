import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
fs.writeFileSync('test_out.mp4', 'dummy');
ffmpeg('test.mp4')
  .outputOptions([
      '-c', 'copy',
      '-map', '0',
      '-metadata', `creation_time=2024-01-01T12:00:00.000Z`
  ])
  .output('test_out.mp4')
  .on('end', () => console.log('success'))
  .on('error', (err, stdout, stderr) => console.log('error', err.message, stderr))
  .run();
