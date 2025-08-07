// Palm Beach Pass Service Worker v1.0.0
const CACHE_NAME = 'palm-beach-pass-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline functionality
const urlsToCache = [
  '/',
  '/index.html',
  '/customer-passes.html',
  '/vendor-portal.html',
  '/qr-system.html',
  '/checkout.html',
  '/customer-account.html',
  '/manifest.json',
  // CDN resources
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lucide/0.263.1/umd/lucide.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] All files cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Cache cleanup complete');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cache with new version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Serve from cache when offline
          return caches.match(event.request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Fallback to index.html for SPA routing
              return caches.match('/index.html');
            });
        })
    );
    return;
  }

  // Handle all other requests with cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          // Update cache in background
          fetch(event.request)
            .then((response) => {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            })
            .catch(() => {
              // Ignore network errors when updating cache
            });
          
          return cachedResponse;
        }

        // Fetch from network and cache for next time
        return fetch(event.request)
          .then((response) => {
            // Only cache successful responses
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch((error) => {
            console.log('[SW] Fetch failed for:', event.request.url, error);
            
            // For HTML requests, return offline page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL) || caches.match('/index.html');
            }
            
            // For other requests, throw the error
            throw error;
          });
      })
  );
});

// Background sync for when connection is restored
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Handle background sync
async function doBackgroundSync() {
  try {
    // Sync any pending data when connection is restored
    console.log('[SW] Performing background sync');
    
    // Example: Sync cached purchases, pass validations, etc.
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_SYNC',
        data: { message: 'Connection restored - syncing data' }
      });
    });
    
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Push notifications for pass updates
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  let notificationData = {
    title: 'Palm Beach Pass',
    body: 'You have a new notification',
    icon: '/manifest-icon-192.png',
    badge: '/manifest-icon-192.png',
    tag: 'palm-beach-pass',
    data: {},
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = { ...notificationData, ...payload };
    } catch (error) {
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title,
      notificationData
    )
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// Message handling from main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_PASS') {
    // Cache pass data for offline access
    const passData = event.data.data;
    caches.open(CACHE_NAME).then((cache) => {
      cache.put(
        `/pass-data/${passData.id}`, 
        new Response(JSON.stringify(passData))
      );
    });
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      type: 'VERSION',
      version: CACHE_NAME
    });
  }
});

// Periodic background sync for pass updates
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'pass-updates') {
    event.waitUntil(syncPassUpdates());
  }
});

// Sync pass updates in background
async function syncPassUpdates() {
  try {
    console.log('[SW] Syncing pass updates');
    
    // Check for pass status updates
    const response = await fetch('/api/passes/check-updates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: Date.now()
      })
    });
    
    if (response.ok) {
      const updates = await response.json();
      
      if (updates.length > 0) {
        // Notify clients about updates
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'PASS_UPDATES',
            data: updates
          });
        });
      }
    }
    
  } catch (error) {
    console.log('[SW] Pass sync failed (offline):', error.message);
  }
}

// Handle app shortcuts
self.addEventListener('notificationclick', (event) => {
  if (event.action === 'passes') {
    event.waitUntil(
      clients.openWindow('/customer-passes.html')
    );
  } else if (event.action === 'browse') {
    event.waitUntil(
      clients.openWindow('/index.html')
    );
  }
});

// Clean up old data periodically
setInterval(() => {
  caches.keys().then((cacheNames) => {
    cacheNames.forEach((cacheName) => {
      if (cacheName.startsWith('palm-beach-pass-') && cacheName !== CACHE_NAME) {
        caches.delete(cacheName);
      }
    });
  });
}, 24 * 60 * 60 * 1000); // Clean up daily

console.log('[SW] Service Worker loaded successfully');

// Immediate cache warming for critical resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Immediately cache critical files
      return cache.addAll([
        '/',
        '/index.html',
        '/customer-passes.html'
      ]);
    })
  );
});
