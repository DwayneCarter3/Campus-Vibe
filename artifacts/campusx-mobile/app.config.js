module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    devDomain:
      process.env.REPLIT_DEV_DOMAIN || "campus-vibe-carterthe3rd.replit.dev",
  },
});
