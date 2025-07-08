/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Finds and unregisters all active Service Workers to ensure the latest
 * version of the application is loaded.
 * This is crucial for development and for clearing out old or "ghost"
 * service workers that might be caching outdated assets.
 */
export async function unregisterAndReload() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service workers are not supported in this browser.');
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    
    if (registrations.length === 0) {
      console.log('No active service workers found.');
      return;
    }

    console.log('Found active service workers. Unregistering...');
    const unregisterPromises = registrations.map(registration => {
      return registration.unregister().then(wasUnregistered => {
        console.log(`Service Worker ${registration.scope} ${wasUnregistered ? 'unregistered successfully.' : 'failed to unregister.'}`);
        return wasUnregistered;
      });
    });

    const results = await Promise.all(unregisterPromises);
    
    // If at least one service worker was unregistered, reload the page.
    if (results.some(Boolean)) {
      console.log('One or more service workers unregistered. Reloading page to apply changes.');
      // Force a reload from the server, bypassing the cache.
      window.location.reload();
    } else {
      console.log('No service workers were unregistered. No reload needed.');
    }
  } catch (error) {
    // This error can occur in certain sandboxed environments (like some IDEs or iframes)
    // where the document's origin is considered opaque or in a state that disallows
    // service worker access (e.g., private browsing). In such cases, we can safely ignore
    // the error and proceed with loading the application.
    if (error instanceof DOMException && (error.name === 'InvalidStateError' || error.name === 'SecurityError')) {
      console.warn('Could not access service workers due to browser/environment restrictions. The application will continue without attempting to unregister old service workers.');
    } else {
      // For any other unexpected errors, log them to the console.
      console.error('An unexpected error occurred during service worker unregistration:', error);
    }
  }
}
