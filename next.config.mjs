/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async redirects() {
    return [
      /**
       * The merchant back office briefly lived at /platform before folding into /admin as
       * a third tab. Handled here rather than by a page that calls redirect(): a route
       * whose only job is to forward should answer with a real Location header at the
       * routing layer, which curl, a link checker and a browser all follow, instead of a
       * rendered page that only a browser resolves.
       */
      { source: "/platform", destination: "/admin", permanent: false },
      { source: "/platform/:path*", destination: "/admin", permanent: false },
    ];
  },
};

export default nextConfig;
