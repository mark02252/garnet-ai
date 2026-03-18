import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { uploadSnsFile } from '@/lib/sns/upload'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

export type VideoRenderInput = {
  slides: Array<{ imageUrl: string; title: string; body: string }>
  durationPerSlide?: number  // seconds, default 4
  width?: number             // default 1080
  height?: number            // default 1920 (9:16 for Reels)
  outputFormat?: 'mp4'
}

export type VideoRenderResult = {
  videoUrl: string
  durationSeconds: number
}

export async function renderSlidesToVideo(input: VideoRenderInput): Promise<VideoRenderResult> {
  const { slides, durationPerSlide = 4, width = 1080, height = 1920 } = input

  if (slides.length === 0) throw new Error('슬라이드가 없습니다.')
  if (!slides.some(s => s.imageUrl)) throw new Error('이미지가 있는 슬라이드가 필요합니다.')

  const tmpDir = await mkdtemp(join(tmpdir(), 'garnet-video-'))

  try {
    // 1. Download all slide images to temp dir
    const imagePaths: string[] = []
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      if (!slide.imageUrl) continue
      const res = await fetch(slide.imageUrl)
      const buffer = Buffer.from(await res.arrayBuffer())
      const ext = slide.imageUrl.includes('.png') ? 'png' : 'jpg'
      const path = join(tmpDir, `slide_${String(i).padStart(3, '0')}.${ext}`)
      await writeFile(path, buffer)
      imagePaths.push(path)
    }

    if (imagePaths.length === 0) throw new Error('다운로드된 이미지가 없습니다.')

    // 2. Create a concat file for ffmpeg
    const concatContent = imagePaths
      .map(p => `file '${p}'\nduration ${durationPerSlide}`)
      .join('\n')
    // Add last image again (ffmpeg concat demuxer requires it)
    const lastImage = imagePaths[imagePaths.length - 1]
    const concatFile = join(tmpDir, 'concat.txt')
    await writeFile(concatFile, concatContent + `\nfile '${lastImage}'`)

    // 3. Run ffmpeg
    const outputPath = join(tmpDir, 'output.mp4')

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-r', '30',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`ffmpeg 오류: ${err.message}`)))
        .run()
    })

    // 4. Upload to Supabase
    const videoBuffer = await readFile(outputPath)
    const fileName = `sns/videos/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
    const videoUrl = await uploadSnsFile(fileName, videoBuffer, 'video/mp4')

    return {
      videoUrl,
      durationSeconds: imagePaths.length * durationPerSlide,
    }
  } finally {
    // Cleanup temp dir
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
