import { KEEP_TEXT } from '../names.ts';

export const KEEP_LOAD_LIMIT_MS = 30_000;

function elements() {
  const panel = document.querySelector<HTMLElement>('#keep-status')!;
  return {
    panel,
    status: panel.querySelector<HTMLElement>('p')!,
    progress: panel.querySelector<HTMLProgressElement>('progress')!,
    back: panel.querySelector<HTMLButtonElement>('button')!,
  };
}

export async function duringKeepLoad<T>(
  load: (signal: AbortSignal, progress: (fraction: number) => void) => Promise<T>,
  backToTitle: () => void,
): Promise<T | undefined> {
  const { panel, status, progress, back } = elements();
  const firstLoad = panel.hasAttribute('data-booting');
  panel.removeAttribute('data-booting');
  const remainingMs = firstLoad ? KEEP_LOAD_LIMIT_MS - performance.now() : KEEP_LOAD_LIMIT_MS;
  panel.hidden = false;
  status.textContent = KEEP_TEXT.loading;
  back.hidden = true;
  progress.hidden = false;
  progress.value = 0;
  const controller = new AbortController();
  const { signal } = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (remainingMs <= 0) throw new Error(KEEP_TEXT.failed);
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(signal.reason);
      }, remainingMs);
    });
    const result = await Promise.race([deadline, load(signal, fraction => {
      if (!signal.aborted) progress.value = fraction;
    })]);
    return result;
  } catch {
    controller.abort();
    status.textContent = KEEP_TEXT.failed;
    progress.hidden = true;
    back.hidden = false;
    back.onclick = () => {
      finishKeepLoad();
      backToTitle();
    };
    back.focus();
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export function finishKeepLoad(): void {
  const { panel, back } = elements();
  panel.hidden = true;
  back.onclick = null;
}
