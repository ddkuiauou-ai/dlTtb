import type { Metadata } from 'next'
import './globals.css'
import Script from 'next/script'
import { ModalProvider } from '@/context/modal-context'
import { PostCacheProvider } from '@/context/post-cache-context'
import { PostViewerModal } from '@/components/post-viewer-modal'
import { TailwindIndicator } from '@/components/tailwind-indicator'
import {
  ClerkProvider,
} from '@clerk/nextjs'

export const metadata: Metadata = {
  title: '뭔일 있슈?',
  description: '모든 커뮤니티의 모든 글을 한 곳에서',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="ko">
        <body>
          <Script id="apply-read-state" strategy="afterInteractive">{`(function(){
  try {
    var KEY = 'readPosts:v2';

    // --- Storage caching ---
    var readSet = new Set();
    function refreshReadSet(){
      try {
        var raw = localStorage.getItem(KEY);
        var obj = raw ? JSON.parse(raw) : {};
        readSet = new Set(Object.keys(obj));
      } catch (_e) {
        readSet = new Set();
      }
    }

    // --- Fast, idempotent marker ---
    var HREF_RE = new RegExp('^/posts/([^/?#]+)');
    function markAnchor(a){
      // quick exits
      if (!a || a.getAttribute('data-read') === '1') return;
      var href = a.getAttribute('href') || '';
      var m = href.match(HREF_RE);
      if (!m) return;
      var id = decodeURIComponent(m[1]);
      if (!readSet.has(id)) return;
      if (!a.classList.contains('is-read')) a.classList.add('is-read');
      a.setAttribute('data-read','1');
    }

    // --- Scan scheduler (batch/RAF) ---
    var scheduled = false;
    function scheduleScan(){
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function(){
        scheduled = false;
        scanAndMark();
      });
    }

    // --- Bounded scan (container-only) ---
    function scanAndMark(){
      // choose a reasonably small root
      var root = document.querySelector('main') || document.body || document;
      if (!root) return;
      var list = root.querySelectorAll('a[href^="/posts/"]');
      for (var i = 0; i < list.length; i++) markAnchor(list[i]);
    }

    // --- Init ---
    refreshReadSet();
    scheduleScan();

    // --- Mutation observer: schedule a scan when nodes are added ---
    var obs = new MutationObserver(function(mutations){
      for (var i = 0; i < mutations.length; i++) {
        var mu = mutations[i];
        if (mu.addedNodes && mu.addedNodes.length) {
          scheduleScan();
          break;
        }
      }
    });
    obs.observe(document.documentElement, { subtree: true, childList: true });

    // --- Navigation/visibility/storage hooks ---
    window.addEventListener('pageshow', function(){ scheduleScan(); });
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible') { refreshReadSet(); scheduleScan(); }
    });
    window.addEventListener('storage', function(e){
      if (e && e.key === KEY) { refreshReadSet(); scheduleScan(); }
    });
    window.addEventListener('readPosts:updated', function(){ refreshReadSet(); scheduleScan(); });

    if (localStorage.getItem('debugReadMark')==='1') {
      console.debug('[read-mark:layout] ready');
    }
  } catch (e) { /* no-op */ }
})();`}</Script>
          <PostCacheProvider>
            <ModalProvider>
              {children}
              <PostViewerModal />
            </ModalProvider>
          </PostCacheProvider>
          <TailwindIndicator />
        </body>
      </html>
    </ClerkProvider>
  )
}
