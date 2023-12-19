import "dotenv/config";

export default {
    urls: process.env.URL_TO_SEARCH.split(',') || [],
    checkInterval: process.env.CHECK_INTERVAL_MS_HIGHEST || 600000,
  };
