const NAV_LINKS = [
  { href: 'index.html', label: '首頁' },
  { href: 'institutional.html', label: '三大法人買賣超' },
];

document.addEventListener('DOMContentLoaded', () => {
  const currentPage = location.pathname.split('/').pop() || 'index.html';

  const linksHtml = NAV_LINKS.map(link => {
    const active = link.href === currentPage ? ' class="active"' : '';
    return `<li><a href="${link.href}"${active}>${link.label}</a></li>`;
  }).join('');

  const navHtml = `
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-brand">Enzo Stock</div>
      <ul class="nav-links">${linksHtml}</ul>
    </nav>
    <button class="nav-toggle" id="navToggle" aria-label="開啟選單">☰</button>
  `;

  document.body.insertAdjacentHTML('afterbegin', navHtml);

  const sidebar = document.getElementById('sidebar');
  const navToggle = document.getElementById('navToggle');

  navToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== navToggle) {
      sidebar.classList.remove('open');
    }
  });
});
