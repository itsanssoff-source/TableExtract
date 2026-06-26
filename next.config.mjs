/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Keep any of your existing configuration options here */
};

// Use a dynamic import so this package is never bundled during production builds
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => {
    initOpenNextCloudflareForDev();
  });
}

export default nextConfig;