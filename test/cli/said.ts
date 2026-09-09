// What a verb told the person: the stream it was handed, and the stderr it wrote past it.

/** A stream a test can hand a verb, and read back whole. */
export function written(): { stream: NodeJS.WritableStream; text(): string } {
  const chunks: string[] = [];
  const stream = { write: (chunk: string) => chunks.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => chunks.join("") };
}

/** stderr, kept, so a test reads the refusal instead of printing it in the middle of the run. */
export function onStderr(): { text(): string; restore(): void } {
  const kept: string[] = [];
  const before = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => {
    kept.push(chunk);
    return true;
  }) as typeof process.stderr.write;
  return { text: () => kept.join(""), restore: () => (process.stderr.write = before) };
}
