/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  images: {
    unoptimized: true,
  },
  // Add both entry points
  webpack: (config, { isServer }) => {
    config.entry = async () => {
      const entries = await config.entry()
      
      // Add headless entry point
      if (isServer) {
        entries['./headless'] = './src/index-headless.ts'
      }
      
      return entries
    }
    return config
  }
}

module.exports = nextConfig
