module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || "oa",
      cwd: __dirname,
      script: "./start.sh",
      interpreter: "bash",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      min_uptime: "10s",
      max_restarts: 5,
      restart_delay: 5000,
      kill_timeout: 5000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
