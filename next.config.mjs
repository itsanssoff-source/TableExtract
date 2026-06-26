/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Your config options here */
};

// This must be a dynamic import so the production build engine ignores it
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => {
    initOpenNextCloudflareForDev();
  });
}

export default nextConfig;