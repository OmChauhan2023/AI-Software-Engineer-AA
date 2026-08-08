/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    '@huggingface/transformers',
    'onnxruntime-node',
    'emergentintegrations',
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
