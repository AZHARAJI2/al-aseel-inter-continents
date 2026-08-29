/* ============================================
   الأصيل بين القارات — Main JavaScript
   Al-Aseel Inter Continents Group
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Navbar Scroll Effect ───
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const handleScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  // ─── Mobile Nav Toggle ───
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('active');
      navLinks.classList.toggle('open');
      document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
    });

    // Close nav on link click
    navLinks.querySelectorAll('a:not(.nav-dropdown-toggle)').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navLinks.classList.remove('open');
        document.body.style.overflow = '';
      });
    });

    // Mobile dropdown toggle
    navLinks.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        if (window.innerWidth <= 992) {
          e.preventDefault();
          toggle.closest('.nav-dropdown').classList.toggle('open');
        }
      });
    });
  }

  // ─── Hero Slider ───
  const heroSlides = document.querySelectorAll('.hero-slide');
  const heroDots = document.querySelectorAll('.hero-dot');
  const heroArrows = document.querySelectorAll('.hero-arrow');
  let currentSlide = 0;
  let slideInterval;

  function goToSlide(index) {
    heroSlides.forEach(s => s.classList.remove('active'));
    heroDots.forEach(d => d.classList.remove('active'));

    currentSlide = (index + heroSlides.length) % heroSlides.length;

    if (heroSlides[currentSlide]) heroSlides[currentSlide].classList.add('active');
    if (heroDots[currentSlide]) heroDots[currentSlide].classList.add('active');
  }

  function nextSlide() {
    goToSlide(currentSlide + 1);
  }

  function startSlider() {
    if (heroSlides.length > 0) {
      slideInterval = setInterval(nextSlide, 6000);
    }
  }

  function resetSlider() {
    clearInterval(slideInterval);
    startSlider();
  }

  heroDots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      goToSlide(i);
      resetSlider();
    });
  });

  heroArrows.forEach(arrow => {
    arrow.addEventListener('click', () => {
      const dir = arrow.dataset.dir;
      if (dir === 'next') goToSlide(currentSlide + 1);
      else goToSlide(currentSlide - 1);
      resetSlider();
    });
  });

  startSlider();

  // ─── Scroll Animations ───
  const animateElements = document.querySelectorAll('.animate-on-scroll');
  if (animateElements.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    animateElements.forEach(el => observer.observe(el));
  }

  // ─── Package Modal ───
  const packageCards = document.querySelectorAll('.package-card[data-modal]');
  const modalOverlay = document.querySelector('.modal-overlay');
  const modalClose = document.querySelector('.modal-close');

  function openModal(card) {
    if (!modalOverlay) return;

    const data = card.dataset;
    const modalImg = modalOverlay.querySelector('.modal-image');
    const modalTitle = modalOverlay.querySelector('.modal-body h2');
    const modalDesc = modalOverlay.querySelector('.modal-description');
    const modalPrice = modalOverlay.querySelector('.modal-price-value');
    const modalDetails = modalOverlay.querySelector('.modal-details');

    if (modalImg) modalImg.src = data.image || '';
    if (modalImg) modalImg.alt = data.title || '';
    if (modalTitle) modalTitle.textContent = data.title || '';
    if (modalDesc) modalDesc.textContent = data.description || '';
    if (modalPrice) modalPrice.textContent = data.price || '';

    // Update detail items
    if (modalDetails && data.details) {
      try {
        const details = JSON.parse(data.details);
        modalDetails.innerHTML = details.map(d => `
          <div class="modal-detail-item">
            <span class="icon">${d.icon}</span>
            <div class="info">
              <span>${d.label}</span>
              <span>${d.value}</span>
            </div>
          </div>
        `).join('');
      } catch(e) {
        // Keep existing details
      }
    }

    // Update WhatsApp link
    const waBtn = modalOverlay.querySelector('.btn-whatsapp');
    if (waBtn) {
      const msg = encodeURIComponent(`مرحباً، أرغب بالاستفسار عن: ${data.title || ''}`);
      waBtn.href = `https://wa.me/967779111667?text=${msg}`;
    }

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.package-card[data-modal]');
    if (card) openModal(card);
  });

  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ─── Transaction Tracking (Google Sheets) ───
  const trackingForm = document.querySelector('.tracking-form');
  const trackingResult = document.querySelector('.tracking-result');

  if (trackingForm) {
    trackingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = trackingForm.querySelector('input');
      const passportNum = input ? input.value.trim() : '';

      if (!passportNum) {
        alert('الرجاء إدخال رقم الجواز');
        return;
      }

      // Show loading state
      if (trackingResult) {
        trackingResult.innerHTML = `
          <div style="text-align:center; padding: 20px;">
            <div class="sheets-spinner"></div>
            <p style="color: rgba(255,255,255,0.6); font-size: 0.875rem;">جارِ البحث...</p>
          </div>
        `;
        trackingResult.classList.add('show');
      }

      // Check if SheetsAPI is available
      if (typeof SheetsAPI !== 'undefined') {
        const result = await SheetsAPI.searchTracking(passportNum);

        if (trackingResult) {
          if (result.found) {
            // Determine status color
            let statusColor = 'var(--gold)';
            let statusIcon = '⏳';
            const status = (result.status || '').toLowerCase();
            if (status.includes('منجز') || status.includes('مكتمل') || status.includes('تم')) {
              statusColor = '#4CAF50';
              statusIcon = '✅';
            } else if (status.includes('مرفوض') || status.includes('ملغ')) {
              statusColor = '#f44336';
              statusIcon = '❌';
            }

            trackingResult.innerHTML = `
              <h4>📋 نتيجة البحث</h4>
              <div class="status-row">
                <span class="label">رقم الجواز:</span>
                <span class="value">${result.passport}</span>
              </div>
              <div class="status-row">
                <span class="label">اسم العميل:</span>
                <span class="value">${result.name}</span>
              </div>
              <div class="status-row">
                <span class="label">الحالة:</span>
                <span class="value" style="color: ${statusColor};">${statusIcon} ${result.status}</span>
              </div>
              <div class="status-row">
                <span class="label">آخر تحديث:</span>
                <span class="value">${result.lastUpdate}</span>
              </div>
            `;
          } else if (result.error) {
            trackingResult.innerHTML = `
              <div style="text-align: center; padding: 20px;">
                <div style="font-size: 36px; margin-bottom: 12px;">⚠️</div>
                <p style="color: rgba(255,255,255,0.7);">${result.error}</p>
              </div>
            `;
          } else {
            trackingResult.innerHTML = `
              <div style="text-align: center; padding: 20px;">
                <div style="font-size: 36px; margin-bottom: 12px;">🔍</div>
                <p style="color: rgba(255,255,255,0.7);">${result.message || 'لم يتم العثور على نتيجة'}</p>
                <p style="margin-top: 12px; font-size: 0.8rem; color: rgba(255,255,255,0.4);">تأكد من رقم الجواز أو تواصل مع الفرع</p>
              </div>
            `;
          }
          trackingResult.classList.add('show');
        }
      } else {
        // Fallback if SheetsAPI not loaded
        if (trackingResult) {
          trackingResult.innerHTML = `
            <div style="text-align: center; padding: 20px;">
              <div style="font-size: 36px; margin-bottom: 12px;">⚠️</div>
              <p style="color: rgba(255,255,255,0.7);">النظام غير متاح حالياً. تواصل مع الفرع مباشرة.</p>
            </div>
          `;
          trackingResult.classList.add('show');
        }
      }
    });
  }

  // ─── Media Center Tabs ───
  const mediaTabs = document.querySelectorAll('.media-tab');
  const mediaPanels = document.querySelectorAll('.media-panel');

  mediaTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      mediaTabs.forEach(t => t.classList.remove('active'));
      mediaPanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.panel);
      if (panel) panel.classList.add('active');
    });
  });

  // ─── Service Tabs (Hajj, Labor) ───
  const serviceTabs = document.querySelectorAll('.service-tab');
  const servicePanels = document.querySelectorAll('.service-panel');

  serviceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      serviceTabs.forEach(t => t.classList.remove('active'));
      servicePanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.panel);
      if (panel) panel.classList.add('active');
    });
  });

  // ─── Branch Contact Selector ───
  const branchBtns = document.querySelectorAll('.branch-btn');
  const branchContents = document.querySelectorAll('.branch-content');

  branchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      branchBtns.forEach(b => b.classList.remove('active'));
      branchContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const content = document.getElementById(btn.dataset.branch);
      if (content) content.classList.add('active');
    });
  });

  // ─── Contact Form ───
  const contactForm = document.querySelector('#contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(contactForm);
      const name = formData.get('name');

      // Show success message
      contactForm.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 60px; margin-bottom: 16px;">✅</div>
          <h3 style="color: var(--navy); font-size: 1.5rem; margin-bottom: 8px;">تم إرسال رسالتك بنجاح!</h3>
          <p style="color: var(--gray-500);">شكراً لك ${name || ''}، سنتواصل معك في أقرب وقت.</p>
        </div>
      `;
    });
  }

  // ─── Quote Form ───
  const quoteForm = document.querySelector('#quote-form');
  if (quoteForm) {
    quoteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(quoteForm);
      const org = formData.get('organization');

      quoteForm.innerHTML = `
        <div class="full-width" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 60px; margin-bottom: 16px;">📨</div>
          <h3 style="color: var(--white); font-size: 1.5rem; margin-bottom: 8px;">تم إرسال طلب العرض الرسمي!</h3>
          <p style="color: rgba(255,255,255,0.7);">شكراً ${org || ''}، سيتم التواصل معكم وإرسال العرض خلال 24 ساعة.</p>
        </div>
      `;
    });
  }

  // ─── Active Navigation Link ───
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ─── Smooth scroll for anchor links ───
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ─── Counter Animation ───
  const counters = document.querySelectorAll('.counter');
  if (counters.length > 0) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = parseInt(entry.target.dataset.target);
          let count = 0;
          const increment = target / 60;
          const timer = setInterval(() => {
            count += increment;
            if (count >= target) {
              entry.target.textContent = target;
              clearInterval(timer);
            } else {
              entry.target.textContent = Math.floor(count);
            }
          }, 30);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));
  }

});
