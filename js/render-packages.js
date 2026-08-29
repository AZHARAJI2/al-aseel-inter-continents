document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('dynamic-packages-grid');
  if (!grid) return;

  // Show loading spinner
  SheetsAPI.showLoading(grid);

  try {
    const packages = await SheetsAPI.loadPackages();

    if (!packages || packages.length === 0) {
      SheetsAPI.showEmpty(grid, 'لا توجد باقات متاحة حالياً، يرجى العودة لاحقاً.');
      return;
    }

    grid.innerHTML = ''; // Clear loading

    let delayIndex = 0;

    packages.forEach(pkg => {
      // Create details array for the modal
      const details = [];
      if (pkg.duration) details.push({ icon: '📅', label: 'المدة', value: pkg.duration });
      if (pkg.destination) details.push({ icon: '📍', label: 'الوجهة', value: pkg.destination });
      if (pkg.includes) details.push({ icon: '✨', label: 'يشمل', value: pkg.includes });
      
      const detailsJson = JSON.stringify(details).replace(/'/g, "&apos;");
      const shortDesc = pkg.description.length > 80 ? pkg.description.substring(0, 80) + '...' : pkg.description;
      const imageUrl = pkg.image || 'images/hero-travel.png'; // Fallback image
      
      const delayClass = delayIndex > 0 ? `animate-delay-${delayIndex}` : '';
      if (delayIndex < 3) delayIndex++;

      const cardHtml = `
        <div class="package-card animate-on-scroll ${delayClass} animated" data-modal
          data-image="${imageUrl}"
          data-title="${pkg.title}"
          data-description="${pkg.description}"
          data-price="${pkg.price}"
          data-details='${detailsJson}'>
          <div class="package-card-image">
            <img src="${imageUrl}" alt="${pkg.title}" loading="lazy">
            <span class="package-card-badge"><i class="fa-solid fa-star"></i> متاحة الآن</span>
          </div>
          <div class="package-card-body">
            <h3>${pkg.title}</h3>
            <p>${shortDesc}</p>
            <div class="package-card-footer">
              <div class="package-price"><span>السعر</span><span>${pkg.price || 'تواصل معنا'}</span></div>
              <span class="package-card-cta">عرض التفاصيل <i class="fa-solid fa-arrow-left"></i></span>
            </div>
          </div>
        </div>
      `;
      
      grid.insertAdjacentHTML('beforeend', cardHtml);
    });

  } catch (error) {
    console.error('Error rendering packages:', error);
    SheetsAPI.showError(grid, 'حدث خطأ أثناء تحميل الباقات. يرجى التأكد من اتصالك بالإنترنت وتحديث الصفحة.');
  }
});
