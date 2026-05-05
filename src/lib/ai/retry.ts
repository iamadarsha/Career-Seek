/**
 * Simple exponential backoff utility for AI API requests.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: any) => void | Promise<void>;
    shouldRetry?: (attempt: number, error: any) => boolean | Promise<boolean>;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    onRetry,
    shouldRetry,
  } = options;

  let attempt = 0;
  
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      
      // If we've reached max attempts, throw the last error
      if (attempt >= maxAttempts) {
        throw error;
      }

      if (shouldRetry) {
        const retryAllowed = await shouldRetry(attempt, error);
        if (!retryAllowed) {
          throw error;
        }
      }

      // Calculate delay with jitter
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt - 1),
        maxDelay
      );
      const jitteredDelay = delay * (0.8 + Math.random() * 0.4);

      if (onRetry) {
        await onRetry(attempt, error);
      } else {
        console.warn(`[AI Retry] Attempt ${attempt} failed, retrying in ${Math.round(jitteredDelay)}ms...`);
      }

      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }

  throw new Error('Retry logic failed to return or throw');
}
