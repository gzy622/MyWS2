(() => {
  const app = document.querySelector('.app-shell');
  const viewport = document.getElementById('viewport');
  const track = document.getElementById('pagesTrack');
  const nav = document.getElementById('bottomNav');
  const selection = document.getElementById('navSelection');
  const navItems = [...document.querySelectorAll('.nav-item')];
  const pages = [...document.querySelectorAll('.page')];
  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('scrim');
  const menuTrigger = document.getElementById('menuTrigger');
  const closeDrawerButton = document.getElementById('closeDrawer');

  let currentPage = 0;
  const subStates = [0, 0, 0];
  const threshold = 70;
  let gesture = null;
  let drawerGesture = null;
  let drawerOpen = false;

  function applyState(dragX = 0, immediate = false) {
    if (immediate) app.classList.add('dragging');
    else app.classList.remove('dragging');
    track.style.transform = `translateX(calc(${-currentPage * 33.333333}% + ${dragX}px))`;
    selection.style.transform = `translateX(calc(${currentPage * 100}% + ${dragX}px))`;

    pages.forEach((page, pageIndex) => {
      const selectedSub = subStates[pageIndex];
      page.querySelectorAll('.segmented button').forEach((button, subIndex) => {
        const active = subIndex === selectedSub;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active);
      });
      page.querySelectorAll('.subview').forEach((view, subIndex) => view.classList.toggle('active', subIndex === selectedSub));
    });

    navItems.forEach((item, index) => {
      const active = index === currentPage;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
      const state = pages[index].querySelectorAll('.segmented button')[subStates[index]].textContent;
      item.querySelector('small').textContent = state;
    });
  }

  function setPage(index) {
    currentPage = Math.max(0, Math.min(2, index));
    applyState();
  }

  function toggleCurrentSub() {
    subStates[currentPage] = subStates[currentPage] === 0 ? 1 : 0;
    applyState();
  }

  function chooseDraggedPage(dx) {
    if (Math.abs(dx) >= threshold) setPage(currentPage + (dx < 0 ? 1 : -1));
    else applyState();
  }

  function startHorizontalGesture(event, source) {
    if (drawerOpen) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, source, direction: null };
    source.setPointerCapture(event.pointerId);
  }

  function moveHorizontalGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture.dx = event.clientX - gesture.x;
    gesture.dy = event.clientY - gesture.y;
    const { dx, dy } = gesture;
    if (!gesture.direction && Math.hypot(dx, dy) > 8) {
      gesture.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (gesture.source === nav && gesture.direction === 'vertical' && dy < -35 && Math.abs(dy) > Math.abs(dx) * 1.25) {
      gesture = null;
      openDrawer();
      return;
    }
    if (gesture.direction === 'horizontal') {
      event.preventDefault();
      const atLeft = currentPage === 0 && dx > 0;
      const atRight = currentPage === 2 && dx < 0;
      const resistance = (atLeft || atRight) ? 0.28 : 1;
      applyState(dx * resistance, true);
    }
  }

  function endHorizontalGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const ended = gesture;
    gesture = null;
    if (ended.direction === 'horizontal') chooseDraggedPage(ended.dx);
    else if (ended.source === nav && Math.hypot(ended.dx, ended.dy) < 10) {
      const button = event.target.closest('.nav-item');
      if (button) {
        const index = Number(button.dataset.nav);
        index === currentPage ? toggleCurrentSub() : setPage(index);
      }
    }
  }

  viewport.addEventListener('pointerdown', event => startHorizontalGesture(event, viewport));
  viewport.addEventListener('pointermove', moveHorizontalGesture, { passive: false });
  viewport.addEventListener('pointerup', endHorizontalGesture);
  viewport.addEventListener('pointercancel', endHorizontalGesture);
  nav.addEventListener('pointerdown', event => {
    if (!event.target.closest('.menu-trigger')) startHorizontalGesture(event, nav);
  });
  nav.addEventListener('pointermove', moveHorizontalGesture, { passive: false });
  nav.addEventListener('pointerup', endHorizontalGesture);
  nav.addEventListener('pointercancel', endHorizontalGesture);

  pages.forEach((page, pageIndex) => {
    page.querySelectorAll('.segmented button').forEach((button, subIndex) => {
      button.addEventListener('click', () => {
        subStates[pageIndex] = subIndex;
        applyState();
      });
    });
  });

  function openDrawer() {
    if (drawerOpen) return;
    drawerOpen = true;
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('visible'));
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    nav.setAttribute('aria-hidden', 'true');
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    drawer.classList.remove('open');
    scrim.classList.remove('visible');
    drawer.setAttribute('aria-hidden', 'true');
    nav.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => { if (!drawerOpen) scrim.hidden = true; }, 260);
  }

  menuTrigger.addEventListener('click', openDrawer);
  closeDrawerButton.addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  drawer.addEventListener('pointerdown', event => {
    drawerGesture = { id:event.pointerId, y:event.clientY, dy:0 };
    drawer.setPointerCapture(event.pointerId);
    drawer.style.transition = 'none';
  });
  drawer.addEventListener('pointermove', event => {
    if (!drawerGesture || drawerGesture.id !== event.pointerId) return;
    drawerGesture.dy = Math.max(0, event.clientY - drawerGesture.y);
    if (drawerGesture.dy) drawer.style.transform = `translateY(${drawerGesture.dy}px)`;
  });
  function endDrawerDrag(event) {
    if (!drawerGesture || drawerGesture.id !== event.pointerId) return;
    const { dy } = drawerGesture;
    drawerGesture = null;
    drawer.style.transition = '';
    drawer.style.transform = '';
    if (dy > 85) closeDrawer();
  }
  drawer.addEventListener('pointerup', endDrawerDrag);
  drawer.addEventListener('pointercancel', endDrawerDrag);

  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
  applyState();
})();
