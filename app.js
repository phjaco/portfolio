/**
 * PORTFOLIO CORE ENGINE
 */

const PROJECT_ORDER = [
    'sojo-s26',
    'fsae-uprights', 
    'choked-flow', 
    'clock-geartrain', 
    'ebike',
    'fluidsimver',
    'chip-clip',
    'magnetic-damping',
    'mmn-surface-prep',
    'mousetrap',
    'frc23',
    'frc22'
    ];

// Pages that are split into their own files and lazy-loaded on demand.
// This includes every project plus DevBlocks, which isn't part of the
// project taskbar/prev-next flow but still lives in its own fragment file.
const LAZY_PAGE_IDS = [...PROJECT_ORDER, 'DevBlocks'];

const DISPLAY_NAMES = {
    'sojo-s26':'SOJO Summer 2026',
    'fsae-uprights': 'FSAE Uprights',
    'choked-flow': 'Choked Flow Impulse',
    'clock-geartrain': 'Clock Geartrain',
    'ebike': 'Electric Bike',
    'fluidsimver' : 'Fluid Sim. Verification',
    'chip-clip' : 'Chip Clip',
    'magnetic-damping' : 'Eddy Current Brakes',
    'mmn-surface-prep' : 'MMN Surfaces',
    'mousetrap':'Mousetrap Car',
    'frc23' : "FRC '23",
    'frc22' : "FRC '22",
    };

const Router = {
    pageCache: new Map(),   // id -> fetched HTML string (kept for the whole session)
    loadedPages: new Set(), // ids currently injected into the DOM

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());

        // Cold direct-link to a lazy page (e.g. someone lands on #choked-flow
        // fresh): hide the default 'home' section immediately so it never
        // flashes on screen before the real target finishes loading.
        const initialId = window.location.hash.substring(1) || 'home';
        if (LAZY_PAGE_IDS.includes(initialId)) {
            const home = document.getElementById('home');
            if (home) home.classList.remove('active');
        }

        this.handleRoute();
        this.initGlobalEvents();

        // Default prefetch: the first project in the list is the one most
        // people click into first from the Projects grid, so warm it up
        // right away regardless of what page they're currently viewing.
        this.prefetchPage(PROJECT_ORDER[0]);
    },

    handleRoute() {
        const id = window.location.hash.substring(1) || 'home';
        this.showPage(id);
    },

    async showPage(id) {
        // For lazy pages, make sure the fragment is fetched and injected
        // into the DOM *before* we touch any .active classes — this is
        // what guarantees the previously-visible page stays on screen,
        // untouched, for the entire duration of the fetch. Nothing ever
        // passes through a state where no page is active.
        if (LAZY_PAGE_IDS.includes(id)) {
            await this.ensurePageLoaded(id);
        }

        const pages = document.querySelectorAll('.page');
        let targetFound = false;

        pages.forEach(page => {
            const isActive = page.id === id;
            page.classList.toggle('active', isActive);
            if (isActive) targetFound = true;
        });

        if (!targetFound) {
            const home = document.getElementById('home');
            if (home) home.classList.add('active');
        }

        window.scrollTo({ top: 0, behavior: 'instant' });

        if (this.pendingScrollTarget) {
            this.scrollToPendingTarget();
            }

        const bar = document.getElementById('global-project-taskbar');
        if (bar) bar.classList.remove('expanded');

        this.updateNav(id);
        this.handleTaskbar(id);

        UIComponents.initCarousels();
        UIComponents.renderMath();
        PDFViewerModule.init();
        PDFViewerHorizontalModule.init();
    },

    async ensurePageLoaded(id) {
        if (this.loadedPages.has(id)) return; // already in the DOM, nothing to do

        const contentContainer = document.getElementById('content');
        if (!contentContainer) return;

        // Show a lightweight loading placeholder while the fragment fetches.
        // This is inserted (not yet active) so it never flashes as visible
        // content on its own — it only becomes visible once showPage()
        // toggles .active after this function resolves.
        const placeholder = document.createElement('section');
        placeholder.id = id;
        placeholder.className = 'page page-loading';
        placeholder.innerHTML = '<div class="page-loading-spinner">Loading…</div>';
        contentContainer.appendChild(placeholder);

        try {
            const html = await this.fetchPageHTML(id);

            const section = document.createElement('section');
            section.id = id;
            section.className = 'page';
            if (id === 'DevBlocks') {
                section.style.paddingTop = '100px';
            }
            section.innerHTML = html;

            placeholder.replaceWith(section);
            this.loadedPages.add(id);

            // Now that this page is loaded, quietly warm up its neighbors
            // in the background so clicking Prev/Next often needs no fetch at all.
            this.prefetchNeighbors(id);
        } catch (err) {
            console.error(`Could not load page "${id}"`, err);
            placeholder.innerHTML = `<div class="page-loading-error">Could not load this page. <a href="#projects">Back to Projects</a></div>`;
        }
    },

    async fetchPageHTML(id) {
        let html = this.pageCache.get(id);
        if (!html) {
            const response = await fetch(`pages/${id}.html`);
            if (!response.ok) throw new Error(`Failed to fetch pages/${id}.html (${response.status})`);
            html = await response.text();
            this.pageCache.set(id, html);
        }
        return html;
    },

    // Fire-and-forget prefetch for a single page id. Silent on failure —
    // this is purely a background optimization, never something that should
    // interrupt or error out the current view.
    prefetchPage(id) {
        if (!id || this.pageCache.has(id) || this.loadedPages.has(id)) return;
        this.fetchPageHTML(id).catch(() => {
            // Swallow errors — a failed prefetch just means the real
            // navigation later will fetch it fresh instead.
        });
    },

    prefetchNeighbors(id) {
        const idx = PROJECT_ORDER.indexOf(id);
        if (idx === -1) return; // DevBlocks or anything outside the project sequence has no "neighbors"
        this.prefetchPage(PROJECT_ORDER[idx - 1]);
        this.prefetchPage(PROJECT_ORDER[idx + 1]);
    },

    updateNav(id) {
        document.querySelectorAll('.nav a').forEach(a => {
            const href = a.getAttribute('href').replace('#', '');
            a.classList.toggle('active', href === id);
        });
    },

    handleTaskbar(id) {
        const isProject = PROJECT_ORDER.includes(id);
        document.body.classList.toggle('in-project', isProject);
        
        if (isProject) {
            this.renderTaskbarButtons(id);
        }
    },

    renderTaskbarButtons(currentId) {
        const container = document.getElementById('taskbar-content');
        if (!container) return;

        const currentIndex = PROJECT_ORDER.indexOf(currentId);
        container.innerHTML = '';

        const getName = (id) => DISPLAY_NAMES[id] || id.replace('project-', '').replace(/-/g, ' ').toUpperCase();
        
        const createBtn = (label, targetId, isNext = false) => {
            const btn = document.createElement('button');
            btn.className = isNext ? 'task-item next-task' : 'task-item';
            btn.innerHTML = label;
            btn.onclick = (e) => {
                e.stopPropagation();
                window.location.hash = targetId;
            };
            return btn;
        };

        if (currentIndex > 0) {
            container.appendChild(createBtn(`← ${getName(PROJECT_ORDER[currentIndex - 1])}`, PROJECT_ORDER[currentIndex - 1]));
        } else {
            container.appendChild(createBtn('All Projects', 'projects'));
        }

        if (currentIndex < PROJECT_ORDER.length - 1) {
            container.appendChild(createBtn(`${getName(PROJECT_ORDER[currentIndex + 1])} →`, PROJECT_ORDER[currentIndex + 1], true));
        } else {
            container.appendChild(createBtn('Back to Gallery', 'projects'));
        }
    },


    
    initGlobalEvents() {
        const scrollTopBtn = document.getElementById('scroll-top');
        if (scrollTopBtn) {
            window.addEventListener('scroll', () => {
                scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
            });
            scrollTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        const backBtn = document.getElementById('back-to-projects');
        const navEl = document.querySelector('.nav');

        if (backBtn && navEl) {
            const OVERLAP = 22;       // how far it tucks behind the nav pill's left edge
            const MIN_SPACE = 60;     // minimum room needed to the left before hiding
            const HEIGHT_REDUCTION = 10; // how much thinner than the nav pill (px, split evenly top/bottom)

            const positionBackButton = () => {
                if (window.innerWidth <= 768) return; // hidden via CSS anyway

                const navRect = navEl.getBoundingClientRect();
                const buttonWidth = backBtn.offsetWidth;
                const desiredLeft = navRect.left - buttonWidth + OVERLAP;

                if (desiredLeft < MIN_SPACE) {
                    backBtn.classList.add('no-room');
                } else {
                    backBtn.classList.remove('no-room');
                    const thinnerHeight = navRect.height - HEIGHT_REDUCTION;
                    backBtn.style.top = `${navRect.top + HEIGHT_REDUCTION / 2}px`;
                    backBtn.style.height = `${thinnerHeight}px`;
                    backBtn.style.left = `${desiredLeft}px`;
                }
            };

            positionBackButton();
            window.addEventListener('resize', positionBackButton);
            window.addEventListener('hashchange', () => setTimeout(positionBackButton, 0));

            let lastScrollY = window.scrollY;
            window.addEventListener('scroll', () => {
                const currentScrollY = window.scrollY;
                const scrollingDown = currentScrollY > lastScrollY;

                if (currentScrollY > 80 && scrollingDown) {
                    backBtn.classList.add('scrolled-down');
                } else {
                    backBtn.classList.remove('scrolled-down');
                }
                lastScrollY = currentScrollY;
            });
        }
    },

    pendingScrollTarget: null,

    // Navigate to a page and smoothly scroll to a specific element inside it,
    // handling both "already on that page" and "need to route there first."
    jumpToSection(pageId, sectionId) {
        this.pendingScrollTarget = sectionId;
        if (window.location.hash.substring(1) === pageId) {
            // Already on this page — hashchange won't fire, so scroll directly.
            this.scrollToPendingTarget();
        } else {
            window.location.hash = pageId; // triggers the normal routing flow
        }
    },

    scrollToPendingTarget() {
        if (!this.pendingScrollTarget) return;
        const el = document.getElementById(this.pendingScrollTarget);
        this.pendingScrollTarget = null;
        if (el) {
            // Let the instant top-scroll from showPage() finish first,
            // then smoothly scroll down to the target section.
            requestAnimationFrame(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    },
};

/**
 * COPY TO CLIPBOARD UTILITY
 */
function copyToClipboard(button) {
  const textToCopy = button.getAttribute('data-copy');
  const originalText = button.innerText;

  navigator.clipboard.writeText(textToCopy).then(() => {
    // Visual Feedback
    button.innerText = "Copied!";
    button.style.background = "#28a745"; // Success green
    button.style.border = "#28a745"; // Success green
    button.style.color = "#FFFFFF";
    
    
    // Reset button after 2 seconds
    setTimeout(() => {
      button.innerText = originalText;
      button.style.background = ""; // Reverts to CSS var(--accent)
          button.style.border = "";
    button.style.color = "";
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
}

const UIComponents = {
    initCarousels() {
        document.querySelectorAll('.carousel').forEach(carousel => {
            if (carousel.dataset.initialized) return;
            carousel.dataset.initialized = "true";
            const track = carousel.querySelector('.carousel-track');
            const nav = carousel.querySelector('.carousel-nav');
            if (!track || !nav) return;

            Array.from(track.children).forEach((_, i) => {
                const dot = document.createElement('button');
                dot.className = `dot ${i === 0 ? 'active' : ''}`;
                dot.onclick = (e) => {
                    e.stopPropagation();
                    track.style.transform = `translateX(-${i * 100}%)`;
                    nav.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
                    dot.classList.add('active');
                };
                nav.appendChild(dot);
            });
        });
    },


     renderMath() {
        if (window.renderMathInElement) {
            renderMathInElement(document.body, {
                delimiters: [
                    { left: "'$$", right: "$$'", display: true },
                    { left: "'$", right: "$'", display: false }
                ]
            });
        } else {
            console.warn('KaTeX not loaded — check that vendor/katex/ files exist and paths are correct.');
        }
    },

    // initModelMaterials() {
    //     // Fix: Added safety checks to prevent breaking the viewer
    //     document.querySelectorAll('model-viewer').forEach(viewer => {
    //         const applyMaterials = () => {
    //             const model = viewer.model;
    //             if (!model || !model.materials) return;
                
    //             model.materials.forEach(mat => {
    //                 if (mat.pbrMetallicRoughness) {
    //                     mat.pbrMetallicRoughness.setRoughnessFactor(0.25);
    //                     mat.pbrMetallicRoughness.setMetallicFactor(1);
    //                 }
    //             });
    //         };

    //         // If already loaded, apply; otherwise wait for load event
    //         if (viewer.loaded) {
    //             applyMaterials();
    //         } else {
    //             viewer.addEventListener('load', applyMaterials);
    //         }
    //     });
    // }
};

document.addEventListener('DOMContentLoaded', () => Router.init());
window.showPage = (id) => window.location.hash = id;

/**
 * PDF VIEWER (custom, lazy-loaded continuous scroll, no native browser chrome)
 */
const PDFViewerModule = {
    async init() {
        const containers = document.querySelectorAll('.pdf-viewer:not([data-initialized])');
        for (const container of containers) {
            container.dataset.initialized = "true";
            this.setupViewer(container);
        }
    },

    async setupViewer(container) {
        const url = container.dataset.pdfUrl;
        if (!url) return;

        const scrollEl = container.querySelector('.pdf-viewer-scroll');
        const pageInfo = container.querySelector('.pdf-viewer-page-info');

        let pdfjsLib;
        try {
            pdfjsLib = await import('./vendor/pdfjs/pdf.min.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.mjs';
        } catch (err) {
            console.error('Failed to load PDF.js', err);
            scrollEl.innerHTML = '<div class="pdf-viewer-loading">Could not load PDF viewer.</div>';
            return;
        }

        let pdfDoc;
        try {
            pdfDoc = await pdfjsLib.getDocument(url).promise;
        } catch (err) {
            console.error('Failed to load PDF', err);
            scrollEl.innerHTML = '<div class="pdf-viewer-loading">Could not load PDF.</div>';
            return;
        }

        scrollEl.innerHTML = '';
        const numPages = pdfDoc.numPages;
        const dpr = window.devicePixelRatio || 1;

        // Measure every page's own dimensions individually (lightweight —
        // this just reads each page's metadata, no rendering happens here),
        // so each placeholder matches that page's real orientation instead
        // of assuming they all match page 1.
        const pageDims = [];
        for (let i = 1; i <= numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1 });
            pageDims.push({ width: viewport.width, height: viewport.height });
        }

        const pageEls = [];
        for (let i = 1; i <= numPages; i++) {
            const { width, height } = pageDims[i - 1];

            const wrap = document.createElement('div');
            wrap.className = 'pdf-page';
            wrap.dataset.pageNum = i;
            wrap.style.aspectRatio = width / height;
            wrap.style.maxWidth = `${width}px`;

            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-page-placeholder';
            placeholder.textContent = `Page ${i}`;
            wrap.appendChild(placeholder);

            scrollEl.appendChild(wrap);
            pageEls.push(wrap);
        }

        const renderedPages = new Set();

        const renderPage = async (wrap) => {
            const num = parseInt(wrap.dataset.pageNum, 10);
            if (renderedPages.has(num)) return;
            renderedPages.add(num);

            const page = await pdfDoc.getPage(num);
            const containerWidth = wrap.clientWidth;
            const unscaledViewport = page.getViewport({ scale: 1 });
            const scale = (containerWidth / unscaledViewport.width) * dpr;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            try {
                await page.render({ canvasContext: ctx, viewport }).promise;
                wrap.innerHTML = '';
                wrap.appendChild(canvas);
            } catch (err) {
                renderedPages.delete(num); // allow retry if render failed/was cancelled
            }
        };

        const unrenderPage = (wrap) => {
            const num = parseInt(wrap.dataset.pageNum, 10);
            if (!renderedPages.has(num)) return;
            renderedPages.delete(num);
            wrap.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-page-placeholder';
            placeholder.textContent = `Page ${num}`;
            wrap.appendChild(placeholder);
        };

        // Preload ~1 viewport ahead/behind; unrender once well outside that margin.
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    renderPage(entry.target);
                } else {
                    unrenderPage(entry.target);
                }
            });
        }, {
            root: scrollEl,
            rootMargin: '600px 0px 600px 0px',
            threshold: 0
        });

        pageEls.forEach(el => observer.observe(el));

        // Track which page is most visible for the "Page X of N" label.
        const labelObserver = new IntersectionObserver((entries) => {
            let best = null;
            entries.forEach(entry => {
                if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) {
                    best = entry;
                }
            });
            if (best) {
                pageInfo.textContent = `Page ${best.target.dataset.pageNum} of ${numPages}`;
            }
        }, {
            root: scrollEl,
            threshold: [0.25, 0.5, 0.75]
        });

        pageEls.forEach(el => labelObserver.observe(el));
    }
};

/**
 * PDF VIEWER — HORIZONTAL (page-by-page, left/right scroll, lazy-loaded)
 */
const PDFViewerHorizontalModule = {
    async init() {
        const containers = document.querySelectorAll('.pdf-viewer-h:not([data-initialized])');
        for (const container of containers) {
            container.dataset.initialized = "true";
            this.setupViewer(container);
        }
    },

    async setupViewer(container) {
        const url = container.dataset.pdfUrl;
        if (!url) return;

        const scrollEl = container.querySelector('.pdf-viewer-h-scroll');
        const pageInfo = container.querySelector('.pdf-viewer-h-page-info');

        let pdfjsLib;
        try {
            pdfjsLib = await import('./vendor/pdfjs/pdf.min.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.mjs';
        } catch (err) {
            console.error('Failed to load PDF.js', err);
            scrollEl.innerHTML = '<div class="pdf-viewer-h-loading">Could not load PDF viewer.</div>';
            return;
        }

        let pdfDoc;
        try {
            pdfDoc = await pdfjsLib.getDocument(url).promise;
        } catch (err) {
            console.error('Failed to load PDF', err);
            scrollEl.innerHTML = '<div class="pdf-viewer-h-loading">Could not load PDF.</div>';
            return;
        }

        scrollEl.innerHTML = '';
        const numPages = pdfDoc.numPages;
        const dpr = window.devicePixelRatio || 1;

        // Measure every page's own aspect ratio so each placeholder holds
        // the correct width before its canvas renders in.
        const pageDims = [];
        for (let i = 1; i <= numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1 });
            pageDims.push({ width: viewport.width, height: viewport.height });
        }

        const pageEls = [];
        for (let i = 1; i <= numPages; i++) {
            const { width, height } = pageDims[i - 1];

            const wrap = document.createElement('div');
            wrap.className = 'pdf-page-h';
            wrap.dataset.pageNum = i;
            wrap.style.aspectRatio = width / height;

            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-page-h-placeholder';
            placeholder.style.aspectRatio = width / height;
            placeholder.textContent = `Page ${i}`;
            wrap.appendChild(placeholder);

            scrollEl.appendChild(wrap);
            pageEls.push(wrap);
        }

        const renderedPages = new Set();

        const renderPage = async (wrap) => {
            const num = parseInt(wrap.dataset.pageNum, 10);
            if (renderedPages.has(num)) return;
            renderedPages.add(num);

            const page = await pdfDoc.getPage(num);
            const containerHeight = wrap.clientHeight;
            const unscaledViewport = page.getViewport({ scale: 1 });
            const scale = (containerHeight / unscaledViewport.height) * dpr;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            try {
                await page.render({ canvasContext: ctx, viewport }).promise;
                wrap.innerHTML = '';
                wrap.appendChild(canvas);
            } catch (err) {
                renderedPages.delete(num); // allow retry if render failed/was cancelled
            }
        };

        const unrenderPage = (wrap) => {
            const num = parseInt(wrap.dataset.pageNum, 10);
            if (!renderedPages.has(num)) return;
            renderedPages.delete(num);
            const { width, height } = pageDims[num - 1];
            wrap.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-page-h-placeholder';
            placeholder.style.aspectRatio = width / height;
            placeholder.textContent = `Page ${num}`;
            wrap.appendChild(placeholder);
        };

        // Preload ~1 screen-width ahead/behind; unrender once well outside that margin.
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    renderPage(entry.target);
                } else {
                    unrenderPage(entry.target);
                }
            });
        }, {
            root: scrollEl,
            rootMargin: '0px 600px 0px 600px', // left/right instead of top/bottom
            threshold: 0
        });

        pageEls.forEach(el => observer.observe(el));

        // Track which page is most visible for the "Page X of N" label.
        const labelObserver = new IntersectionObserver((entries) => {
            let best = null;
            entries.forEach(entry => {
                if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) {
                    best = entry;
                }
            });
            if (best) {
                pageInfo.textContent = `Page ${best.target.dataset.pageNum} of ${numPages}`;
            }
        }, {
            root: scrollEl,
            threshold: [0.25, 0.5, 0.75]
        });

        pageEls.forEach(el => labelObserver.observe(el));
    }
};