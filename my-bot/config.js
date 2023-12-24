import "dotenv/config";

export default {
    checkInterval: process.env.CHECK_INTERVAL_MS_HIGHEST || 600000,
  };
