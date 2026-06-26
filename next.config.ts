/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Your existing Next.js config choices */
};

// Inject OpenNext development bindings wrapper
if (process.env.NODE_ENV !== "production") {
  import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => {
    initOpenNextCloudflareForDev();
  });
}

export default nextConfig;