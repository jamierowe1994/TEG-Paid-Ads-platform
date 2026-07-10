// Next.js server-boot hook. The real work lives in instrumentation-node.ts,
// imported only when the runtime is Node — keeping node-builtin imports (fs,
// pg, …) out of any non-node compilation of this file.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
