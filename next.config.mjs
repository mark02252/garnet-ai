/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone은 Tauri DMG 빌드에서만 사용 (NEXT_OUTPUT=standalone)
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
