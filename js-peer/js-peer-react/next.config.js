/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
