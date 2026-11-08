/** Load .env if present (Node's built-in loader). Never prints values. */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file: rely on the real environment
}
