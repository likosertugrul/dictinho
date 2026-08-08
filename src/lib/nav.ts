import { router } from 'expo-router';

/**
 * Close a modal screen. `router.back()` alone is a no-op when the screen was
 * opened directly by URL (a web deep link has nothing to go back to), which
 * leaves the user stuck on the modal after saving.
 */
export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
