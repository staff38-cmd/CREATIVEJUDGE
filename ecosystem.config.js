module.exports = {
  apps: [
    {
      name: "creativejudge",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/home/ubuntu/app",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        ANTHROPIC_API_KEY: "your-api-key-here",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1500M",
    },
  ],
};
