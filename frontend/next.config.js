/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for production Docker deployment
  output: 'standalone',

  async rewrites() {
    // In production, NEXT_PUBLIC_API_URL points to the backend container hostname
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/backend/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
