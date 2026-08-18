interface ShutdownDependencies {
  stopTimers(): void;
  closeHttp(): Promise<void>;
  stopAndDrain(): Promise<void>;
  disconnect(): Promise<void>;
}

export async function shutdownBackend(deps: ShutdownDependencies): Promise<void> {
  deps.stopTimers();
  const httpClosed = deps.closeHttp();
  await deps.stopAndDrain();
  await httpClosed;
  await deps.disconnect();
}
