// What a verb reads its key and gateway from, for a test: the process's environment, the way a
// server's secrets hand them over. A project's `.env` is read the same way (env.test.ts).

/** An environment whose whole content is that gateway and that key. */
export function pointingAt(url: string, key: string): NodeJS.ProcessEnv {
  return { PINECALL_KEY: key, PINECALL_URL: url };
}

/**
 * An environment with no key in it. The verb then looks for a `.env` up from where the suite runs,
 * and this checkout keeps none — `.env` is git-ignored, and a test that found one would be reading
 * somebody's own key.
 */
export function pointingNowhere(): NodeJS.ProcessEnv {
  return {};
}
