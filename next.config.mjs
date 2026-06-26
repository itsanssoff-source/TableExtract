/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Your existing Next.js config choices */
};

// Inject OpenNext development bindings wrapper
if (process.env.NODE_ENV !== "production") {
  const { initOpenNextCloudflareForDev } = await import(
    "@opennextjs/cloudflare"
  );
  initOpenNextCloudflareForDev();
}

export default nextConfig;
